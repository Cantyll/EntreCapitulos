import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  BackupError,
  buildManifest,
  checkAge,
  checkSize,
  checkTables,
  compareCounts,
  countCopyRows,
  latestEntry,
  parseBackupChoice,
  previousEntry,
  sha256,
  validateManifest,
  type BackupConfig,
} from '../../scripts/backup/lib.mjs';

const config = JSON.parse(readFileSync('.github/backup.config.json', 'utf8')) as BackupConfig;

const HASH = 'a'.repeat(64);

describe('countCopyRows', () => {
  it('conta as linhas de cada bloco COPY, inclusive vazio, sem tocar no conteúdo', () => {
    const dump = [
      'SET session_replication_role = replica;',
      'COPY "auth"."users" (id, email) FROM stdin;',
      'id-1\tfulana@exemplo.test',
      'id-2\tbeltrano@exemplo.test',
      '\\.',
      'COPY "public"."books" (id, title) FROM stdin;',
      '\\.',
      'COPY "public"."comments" (id, body) FROM stdin;',
      'c1\ttexto com\\nquebra escapada',
      '\\.',
    ];
    expect(countCopyRows(dump)).toEqual({
      'auth.users': 2,
      'public.books': 0,
      'public.comments': 1,
    });
  });
});

describe('checkTables', () => {
  const all = Object.fromEntries(config.dump.allowedTables.map((table) => [table, 1]));

  it('aceita o conjunto esperado', () => {
    expect(() => checkTables(all, config)).not.toThrow();
  });

  it.each(['auth.users', 'auth.identities'])('falha com mensagem clara se faltar %s', (table) => {
    const counts = { ...all };
    delete counts[table];
    expect(() => checkTables(counts, config)).toThrow(new RegExp(`não trouxe a tabela ${table}`));
  });

  it('falha se vier uma tabela fora da lista (por exemplo, sessões do Auth)', () => {
    expect(() => checkTables({ ...all, 'auth.sessions': 4 }, config)).toThrow(/auth\.sessions/);
  });

  it('aceita o dump de um banco com as tabelas da gestão de membros, com linhas', () => {
    expect(() =>
      checkTables({ ...all, 'public.member_audit': 12, 'public.member_suspensions': 2 }, config),
    ).not.toThrow();
  });

  it('aceita um dump de antes da migration (sem as tabelas da gestão de membros): o primeiro backup depois do Database deploy não pode falhar por isso', () => {
    const counts = { ...all };
    delete counts['public.member_audit'];
    delete counts['public.member_suspensions'];
    expect(checkTables(counts, config).absent).toEqual([
      'public.member_audit',
      'public.member_suspensions',
    ]);
  });

  it('não confunde tabela vazia com tabela ausente', () => {
    expect(() => checkTables({ ...all, 'public.books': 0 }, config)).not.toThrow();
  });
});

describe('manifesto', () => {
  const base = {
    createdAt: '2026-10-03T06:23:00.000Z',
    cliVersion: '2.118.0',
    repoLatestMigration: '20261002143053_privacy_abuse_controls.sql',
    counts: { 'auth.users': 3, 'public.comments': 7 },
    files: { 'data.sql': HASH, 'roles.sql': HASH, 'schema.sql': HASH },
  };

  it('guarda só metadados: data, versões, contagens e hashes', () => {
    const manifest = buildManifest(base);
    expect(Object.keys(manifest).sort()).toEqual([
      'cliVersion',
      'createdAt',
      'files',
      'formatVersion',
      'repoLatestMigration',
      'tables',
    ]);
    // Nada que pareça dado pessoal: sem e-mail, sem UUID, sem texto livre.
    const text = JSON.stringify(manifest);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it('recusa campo extra, contagem negativa, nome de tabela estranho e hash inválido', () => {
    const ok = buildManifest(base);
    expect(() => validateManifest({ ...ok, email: 'x@y.z' })).toThrow(/inesperado/);
    expect(() => validateManifest({ ...ok, tables: { 'auth.users': -1 } })).toThrow(/contagem/);
    expect(() => validateManifest({ ...ok, tables: { 'auth.users; drop table x': 1 } })).toThrow(
      /contagem/,
    );
    expect(() => validateManifest({ ...ok, files: { 'data.sql': 'zz' } })).toThrow(/hash/);
  });

  it('sha256 conhecido', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('compareCounts', () => {
  it('passa quando bate e cita só o nome das tabelas quando não bate', () => {
    expect(() => compareCounts({ 'auth.users': 3 }, { 'auth.users': 3 })).not.toThrow();
    expect(() =>
      compareCounts({ 'auth.users': 3, 'public.books': 1 }, { 'auth.users': 2, 'public.books': 1 }),
    ).toThrow(/auth\.users/);
  });
});

describe('checkSize', () => {
  it('falha com dump vazio ou minúsculo', () => {
    expect(() => checkSize({ size: 0, config })).toThrow(/vazio/);
    expect(() => checkSize({ size: 100, config })).toThrow(/mínimo plausível/);
  });

  it('falha se for menos da metade do anterior, a não ser com accept_smaller', () => {
    expect(() => checkSize({ size: 40_000, previousSize: 100_000, config })).toThrow(
      /menos da metade/,
    );
    expect(() =>
      checkSize({ size: 40_000, previousSize: 100_000, config, acceptSmaller: true }),
    ).not.toThrow();
    expect(() => checkSize({ size: 60_000, previousSize: 100_000, config })).not.toThrow();
  });

  it('o primeiro backup não tem com o que comparar', () => {
    expect(() => checkSize({ size: 5_000, previousSize: null, config })).not.toThrow();
  });
});

describe('idade dos backups (as duas regras do drill)', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

  it('diário: até 36 h passa; acima falha dizendo que o backup diário parou', () => {
    expect(() =>
      checkAge({ kind: 'daily', lastModified: hoursAgo(30), config, now }),
    ).not.toThrow();
    expect(() => checkAge({ kind: 'daily', lastModified: hoursAgo(37), config, now })).toThrow(
      /backup diário .* parou de rodar/,
    );
  });

  it('semanal: até 8 dias (192 h) passa; acima falha dizendo que falta o de domingo', () => {
    expect(() =>
      checkAge({ kind: 'weekly', lastModified: hoursAgo(7 * 24), config, now }),
    ).not.toThrow();
    expect(() =>
      checkAge({ kind: 'weekly', lastModified: hoursAgo(8 * 24 + 1), config, now }),
    ).toThrow(/semanal .* 8 dias.* domingo/);
  });

  it('as duas regras são independentes: 100 h é velho para o diário e normal para o semanal', () => {
    expect(() => checkAge({ kind: 'daily', lastModified: hoursAgo(100), config, now })).toThrow(
      BackupError,
    );
    expect(() =>
      checkAge({ kind: 'weekly', lastModified: hoursAgo(100), config, now }),
    ).not.toThrow();
  });
});

describe('listagem', () => {
  const entries = [
    { key: 'daily/2026-10-01.tar.gpg', size: 10, lastModified: '2026-10-01T06:30:00Z' },
    { key: 'daily/2026-10-03.tar.gpg', size: 30, lastModified: '2026-10-03T06:30:00Z' },
    { key: 'daily/2026-10-02.tar.gpg', size: 20, lastModified: '2026-10-02T06:30:00Z' },
  ];

  it('acha o mais recente e o anterior ao de hoje', () => {
    expect(latestEntry(entries)?.key).toBe('daily/2026-10-03.tar.gpg');
    expect(previousEntry(entries, 'daily/2026-10-03.tar.gpg')?.key).toBe(
      'daily/2026-10-02.tar.gpg',
    );
    expect(previousEntry(entries, 'daily/2026-10-01.tar.gpg')).toBeNull();
    expect(latestEntry([])).toBeNull();
  });

  it('só aceita daily/AAAA-MM-DD ou weekly/AAAA-MM-DD como escolha de restauração', () => {
    expect(parseBackupChoice('weekly/2026-09-27', config)).toBe('weekly/2026-09-27.tar.gpg');
    for (const bad of [
      '',
      'daily/2026-9-3',
      '../daily/2026-10-03',
      'daily/2026-10-03.tar.gpg',
      'x/2026-10-03',
    ]) {
      expect(() => parseBackupChoice(bad, config)).toThrow(/daily\/AAAA-MM-DD/);
    }
  });
});
