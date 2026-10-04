import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * Comportamento dos scripts de backup com uma CLI do Supabase e um psql FALSOS (dados sintéticos).
 * Prova: o texto puro e a frase-senha nunca saem na tela; o arquivo final é criptografado; abrir com a
 * frase errada falha; faltando auth.users o dump é recusado; as salvaguardas de restauração recusam.
 * O ciclo contra um Postgres de verdade roda em scripts/backup/roundtrip.sh (job do banco do CI).
 */
const MARKER = 'fulana-de-teste@exemplo.test'; // dado pessoal SINTÉTICO que nunca pode aparecer em log
const PASSPHRASE = 'frase-de-teste-para-vitest-123';
const ROOT = process.cwd();

/** O tipo de `env` do Next exige NODE_ENV; estes testes montam o ambiente à mão. */
const procEnv = (vars: Record<string, string>) => vars as NodeJS.ProcessEnv;

let tmp: string;
let fakeBin: string;

const FAKE_SUPABASE = `#!/usr/bin/env bash
# CLI falsa: escreve dumps sintéticos no arquivo pedido por -f.
if [ "$1" = "--version" ]; then echo "2.118.0"; exit 0; fi
file=""; kind=schema
while [ $# -gt 0 ]; do
  case "$1" in -f) file="$2"; shift ;; --role-only) kind=roles ;; --data-only) kind=data ;; esac
  shift
done
if [ "\${FAKE_FAIL:-}" = "$kind" ]; then
  # Falha no formato da CLI 2.118, com ruído: a frase-senha e um dado pessoal misturados ao erro.
  printf '{"_tag":"Error","error":{"code":"DockerRunError","message":"falhou %s"}}\\n' "${MARKER}"
  printf 'linha com ${MARKER} e %s\\n' "$BACKUP_PASSPHRASE"
  exit 3
fi
case "$kind" in
  roles) echo "CREATE ROLE exemplo;" >"$file" ;;
  schema) echo "CREATE TABLE exemplo (id int);" >"$file" ;;
  data)
    {
      echo "SET session_replication_role = replica;"
      if [ "\${FAKE_OMIT_USERS:-}" != "1" ]; then
        printf 'COPY "auth"."users" (id, email) FROM stdin;\\n1\\t${MARKER}\\n2\\toutra@exemplo.test\\n\\\\.\\n'
      fi
      printf 'COPY "auth"."identities" (id, email) FROM stdin;\\n1\\t${MARKER}\\n\\\\.\\n'
      printf 'COPY "public"."comments" (id, body) FROM stdin;\\nc1\\tcomentario de teste\\n\\\\.\\n'
      if [ "\${FAKE_EXTRA_TABLE:-}" = "1" ]; then printf 'COPY "auth"."sessions" (id) FROM stdin;\\ns1\\n\\\\.\\n'; fi
    } >"$file" ;;
esac
`;

function run(script: string, env: Record<string, string>, args: string[] = []) {
  const result = spawnSync('bash', [`scripts/backup/${script}`, ...args], {
    cwd: ROOT,
    env: procEnv({ PATH: `${fakeBin}:${process.env.PATH}`, HOME: tmp, ...env }),
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function workdir(name: string) {
  const dir = join(tmp, name);
  spawnSync('mkdir', ['-p', dir]);
  return dir;
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'backup-test-'));
  fakeBin = join(tmp, 'bin');
  spawnSync('mkdir', ['-p', fakeBin]);
  writeFileSync(join(fakeBin, 'supabase'), FAKE_SUPABASE);
  chmodSync(join(fakeBin, 'supabase'), 0o755);
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const base = (dir: string) => ({
  BACKUP_WORKDIR: dir,
  BACKUP_PASSPHRASE: PASSPHRASE,
  DUMP_TARGET: '--local',
});

describe('make-backup.sh', () => {
  it('gera o arquivo criptografado, sem texto puro no disco nem na tela', () => {
    const dir = workdir('ok');
    const { status, output } = run('make-backup.sh', base(dir));
    expect(output).not.toContain(MARKER);
    expect(output).not.toContain(PASSPHRASE);
    expect(status).toBe(0);
    const encrypted = join(dir, 'backup.tar.gpg');
    expect(existsSync(encrypted)).toBe(true);
    expect(readFileSync(encrypted).includes(MARKER)).toBe(false);
    // O texto puro (stage e o tar) foi apagado.
    expect(existsSync(join(dir, 'stage'))).toBe(false);
    expect(existsSync(join(dir, 'backup.tar'))).toBe(false);
    expect(readdirSync(dir)).toEqual(['backup.tar.gpg']);
  });

  it('recusa o dump sem auth.users, com mensagem clara', () => {
    const dir = workdir('sem-users');
    const { status, output } = run('make-backup.sh', { ...base(dir), FAKE_OMIT_USERS: '1' });
    expect(status).not.toBe(0);
    expect(output).toMatch(/não trouxe a tabela auth\.users/);
    expect(output).not.toContain(MARKER);
    expect(existsSync(join(dir, 'backup.tar.gpg'))).toBe(false);
  });

  it('recusa uma tabela fora da lista permitida (sessões do Auth)', () => {
    const dir = workdir('extra');
    const { status, output } = run('make-backup.sh', { ...base(dir), FAKE_EXTRA_TABLE: '1' });
    expect(status).not.toBe(0);
    expect(output).toMatch(/auth\.sessions/);
  });

  it('exige a frase-senha', () => {
    const dir = workdir('sem-frase');
    const { status, output } = run('make-backup.sh', {
      BACKUP_WORKDIR: dir,
      DUMP_TARGET: '--local',
    });
    expect(status).not.toBe(0);
    expect(output).toMatch(/BACKUP_PASSPHRASE/);
  });
});

describe('open-backup.sh', () => {
  it('abre com a frase certa e confere o manifesto; falha com a errada sem mostrar dado', () => {
    const dir = workdir('abrir');
    expect(run('make-backup.sh', base(dir)).status).toBe(0);
    const file = join(dir, 'backup.tar.gpg');

    const good = run('open-backup.sh', base(dir), [file, join(dir, 'opened')]);
    expect(good.status).toBe(0);
    expect(readFileSync(join(dir, 'opened', 'data.sql'), 'utf8')).toContain(MARKER);
    const manifest = JSON.parse(readFileSync(join(dir, 'opened', 'manifest.json'), 'utf8'));
    expect(manifest.tables).toEqual({
      'auth.users': 2,
      'auth.identities': 1,
      'public.comments': 1,
    });
    expect(JSON.stringify(manifest)).not.toContain('@');

    const bad = run('open-backup.sh', { ...base(dir), BACKUP_PASSPHRASE: 'frase-errada' }, [
      file,
      join(dir, 'opened2'),
    ]);
    expect(bad.status).not.toBe(0);
    expect(bad.output).toMatch(/frase-senha está errada ou o arquivo está corrompido/);
    expect(bad.output).not.toContain(MARKER);
    expect(existsSync(join(dir, 'opened2', 'data.sql'))).toBe(false);
  });

  it('detecta um arquivo adulterado', () => {
    const dir = workdir('adulterado');
    expect(run('make-backup.sh', base(dir)).status).toBe(0);
    const file = join(dir, 'backup.tar.gpg');
    const bytes = readFileSync(file);
    bytes[bytes.length - 20] = bytes[bytes.length - 20]! ^ 0xff; // vira um bit no fim do arquivo
    writeFileSync(file, bytes);
    const result = run('open-backup.sh', base(dir), [file, join(dir, 'opened')]);
    expect(result.status).not.toBe(0);
    expect(existsSync(join(dir, 'opened', 'data.sql'))).toBe(false);
  });
});

describe('salvaguardas de restauração', () => {
  const restoreEnv = (dir: string, extra: Record<string, string> = {}) => ({
    BACKUP_WORKDIR: dir,
    BACKUP_PASSPHRASE: PASSPHRASE,
    BACKUP_CHOICE: 'daily/2026-10-03',
    DRY_RUN: 'true',
    RESTORE_TARGET_PROJECT_REF: 'alvoalvoalvoalvo',
    RESTORE_TARGET_DB_PASSWORD: 'senha-de-teste',
    SUPABASE_ACCESS_TOKEN: 'token-de-teste',
    R2_ACCOUNT_ID: 'conta',
    R2_ACCESS_KEY_ID: 'chave',
    R2_SECRET_ACCESS_KEY: 'segredo',
    R2_BUCKET: 'bucket',
    ...extra,
  });

  it('recusa quando o destino é o projeto de produção', () => {
    const dir = workdir('prod');
    const { status, output } = run(
      'restore-remote.sh',
      restoreEnv(dir, { PRODUCTION_PROJECT_REF: 'alvoalvoalvoalvo' }),
    );
    expect(status).not.toBe(0);
    expect(output).toMatch(/RECUSADO: o projeto de destino é o de produção/);
  });

  it('falha fechado se a referência da produção não foi configurada', () => {
    const dir = workdir('sem-prod');
    const { status, output } = run('restore-remote.sh', restoreEnv(dir));
    expect(status).not.toBe(0);
    expect(output).toMatch(/PRODUCTION_PROJECT_REF não está configurada/);
  });

  it('recusa uma escolha de backup fora do formato antes de qualquer acesso à rede', () => {
    const dir = workdir('escolha');
    const { status, output } = run(
      'restore-remote.sh',
      restoreEnv(dir, { PRODUCTION_PROJECT_REF: 'outroprojetoprod', BACKUP_CHOICE: '../x' }),
    );
    expect(status).not.toBe(0);
    expect(output).toMatch(/daily\/AAAA-MM-DD/);
  });

  describe('restore-data.sh (com psql falso)', () => {
    const FAKE_PSQL = `#!/usr/bin/env bash
# psql falso: devolve contagens fixas para a consulta de conferência.
for a in "$@"; do
  if [ "$a" = "-c" ]; then want=1; fi
done
if [[ "$*" == *"json_build_object"* ]]; then echo '{"auth.users": 5, "auth.identities": 1, "public.comments": 1}'; fi
exit 0
`;
    let dir: string;
    beforeAll(() => {
      writeFileSync(join(fakeBin, 'psql'), FAKE_PSQL);
      chmodSync(join(fakeBin, 'psql'), 0o755);
      dir = workdir('restore-data');
      expect(run('make-backup.sh', base(dir)).status).toBe(0);
      expect(
        run('open-backup.sh', base(dir), [join(dir, 'backup.tar.gpg'), join(dir, 'opened')]).status,
      ).toBe(0);
    });

    it('empty-only recusa um destino que já tem linhas e não cita nenhum dado', () => {
      const { status, output } = run(
        'restore-data.sh',
        {
          BACKUP_WORKDIR: dir,
          RESTORE_MODE: 'empty-only',
          RESTORE_DB_URL: 'postgresql://postgres.x@pooler.exemplo:5432/postgres',
        },
        [join(dir, 'opened')],
      );
      expect(status).not.toBe(0);
      expect(output).toMatch(/não está vazio/);
      expect(output).not.toContain(MARKER);
    });

    it('local-truncate recusa um host que não seja local', () => {
      const { status, output } = run(
        'restore-data.sh',
        {
          BACKUP_WORKDIR: dir,
          RESTORE_MODE: 'local-truncate',
          RESTORE_DB_URL: 'postgresql://postgres.x@pooler.exemplo:5432/postgres',
        },
        [join(dir, 'opened')],
      );
      expect(status).not.toBe(0);
      expect(output).toMatch(/só vale para um banco local/);
    });

    it('detecta contagens que não batem com o manifesto', () => {
      // O psql falso devolve 5 usuários, mas o manifesto diz 2.
      const { status, output } = run(
        'restore-data.sh',
        {
          BACKUP_WORKDIR: dir,
          RESTORE_MODE: 'local-truncate',
          RESTORE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        },
        [join(dir, 'opened')],
      );
      expect(status).not.toBe(0);
      expect(output).toMatch(/contagens .* não batem|não bate/i);
    });
  });
});

describe('falhas sem verbose: só texto fixo, código de saída e o identificador permitido', () => {
  it('make-backup.sh: o dump que falha mostra o identificador e nenhuma linha da ferramenta', () => {
    for (const kind of ['roles', 'schema', 'data']) {
      const dir = workdir(`falha-${kind}`);
      const { status, output } = run('make-backup.sh', { ...base(dir), FAKE_FAIL: kind });
      expect(status).toBe(1);
      expect(output).toMatch(
        /Falhou: dump d[oa]s? \w+\. Código de saída 3\. Identificador do erro: DockerRunError\./,
      );
      expect(output).not.toContain(MARKER);
      expect(output).not.toContain(PASSPHRASE);
      expect(output).not.toMatch(/verbose/i);
      expect(existsSync(join(dir, '.last-error'))).toBe(false);
      expect(existsSync(join(dir, 'tool.log'))).toBe(false);
      expect(existsSync(join(dir, 'backup.tar.gpg'))).toBe(false);
    }
  });

  it('upload.sh e os demais: a falha do aws mostra só o identificador (nada do stderr)', () => {
    const dir = workdir('falha-aws');
    writeFileSync(
      join(fakeBin, 'aws'),
      `#!/usr/bin/env bash
printf '\\nAn error occurred (AccessDenied) when calling the ListObjectsV2 operation: Access Denied %s %s\\n' "$AWS_SECRET_ACCESS_KEY" "${MARKER}" >&2
exit 254
`,
    );
    chmodSync(join(fakeBin, 'aws'), 0o755);
    const result = spawnSync(
      'bash',
      [
        '-c',
        `source scripts/backup/common.sh; export R2_ENDPOINT=http://127.0.0.1:1; r2_list daily/`,
      ],
      {
        cwd: ROOT,
        env: procEnv({
          PATH: `${fakeBin}:${process.env.PATH}`,
          HOME: tmp,
          BACKUP_WORKDIR: dir,
          R2_BUCKET: 'bucket-de-teste',
          AWS_SECRET_ACCESS_KEY: 'segredo-do-aws-de-teste-123456',
        }),
        encoding: 'utf8',
      },
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain(
      'Não foi possível listar o bucket do R2. Código de saída 254. Identificador do erro: AccessDenied.',
    );
    expect(output).not.toContain('segredo-do-aws-de-teste-123456');
    expect(output).not.toContain(MARKER);
    expect(output).not.toContain('Access Denied');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('um identificador fora da lista estrita não sai (só o código de saída)', () => {
    const dir = workdir('falha-ident-ruim');
    writeFileSync(
      join(fakeBin, 'aws'),
      `#!/usr/bin/env bash
printf 'An error occurred (com espaço e ${MARKER}) when calling the X operation: y\\n' >&2
exit 255
`,
    );
    chmodSync(join(fakeBin, 'aws'), 0o755);
    const result = spawnSync(
      'bash',
      [
        '-c',
        `source scripts/backup/common.sh; export R2_ENDPOINT=http://127.0.0.1:1; r2_list daily/`,
      ],
      {
        cwd: ROOT,
        env: procEnv({
          PATH: `${fakeBin}:${process.env.PATH}`,
          HOME: tmp,
          BACKUP_WORKDIR: dir,
          R2_BUCKET: 'bucket-de-teste',
        }),
        encoding: 'utf8',
      },
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('Não foi possível listar o bucket do R2. Código de saída 255.');
    expect(output).not.toContain('Identificador do erro');
    expect(output).not.toContain(MARKER);
  });
});
