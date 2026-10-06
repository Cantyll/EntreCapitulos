import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { isTableName, type BackupConfig } from '../../scripts/backup/lib.mjs';

const config = JSON.parse(readFileSync('.github/backup.config.json', 'utf8')) as BackupConfig;
const operacao = readFileSync('docs/operacao.md', 'utf8');

describe('configuração do backup (.github/backup.config.json)', () => {
  it('retenção: inteiros positivos, semanal maior que diário (proposta: 14 e 56 dias)', () => {
    const { daily, weekly } = config.retentionDays;
    expect(Number.isInteger(daily) && daily > 0).toBe(true);
    expect(Number.isInteger(weekly) && weekly > daily).toBe(true);
  });

  it('a documentação cita os mesmos números da configuração (valores num só lugar)', () => {
    const { daily, weekly } = config.retentionDays;
    expect(operacao).toContain(`${daily} dias`);
    expect(operacao).toContain(`${weekly} dias`);
  });

  it('idades máximas: diário 36 h e semanal 192 h (8 dias), conferidas pelo drill', () => {
    expect(config.maxAgeHours).toEqual({ daily: 36, weekly: 192 });
  });

  it('tamanho: mínimo plausível e fração do anterior entre 0 e 1', () => {
    expect(config.size.minBytes).toBeGreaterThan(0);
    expect(config.size.minRatioOfPrevious).toBeGreaterThan(0);
    expect(config.size.minRatioOfPrevious).toBeLessThan(1);
  });

  it('prefixos distintos e terminados em barra', () => {
    expect(config.prefixes.daily).toMatch(/\/$/);
    expect(config.prefixes.weekly).toMatch(/\/$/);
    expect(config.prefixes.daily).not.toBe(config.prefixes.weekly);
  });

  it('tabelas: nomes válidos, auth.users e auth.identities exigidas, nada excluído que seja permitido', () => {
    const { allowedTables, excludeTables, requiredTables, schemas } = config.dump;
    for (const table of [...allowedTables, ...excludeTables, ...requiredTables]) {
      expect(isTableName(table)).toBe(true);
    }
    expect(requiredTables).toEqual(expect.arrayContaining(['auth.users', 'auth.identities']));
    for (const table of requiredTables) expect(allowedTables).toContain(table);
    for (const table of excludeTables) expect(allowedTables).not.toContain(table);
    expect(schemas).toEqual(['public', 'auth']);
  });

  it('toda tabela que uma migration cria em `public` está em allowedTables ou excludeTables (senão o backup diário falha)', () => {
    const dir = 'supabase/migrations';
    const created = new Set<string>();
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql'))) {
      const sql = readFileSync(`${dir}/${file}`, 'utf8').replace(/--[^\n]*/g, '');
      for (const match of sql.matchAll(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi,
      )) {
        created.add(`public.${match[1]!.toLowerCase()}`);
      }
    }
    expect(created.size).toBeGreaterThan(8);
    const known = new Set([...config.dump.allowedTables, ...config.dump.excludeTables]);
    expect([...created].filter((table) => !known.has(table))).toEqual([]);
  });

  it('as tabelas da gestão de membros (etapa 8f) entram no backup: sem elas o backup diário falharia', () => {
    // O backup falha se o dump trouxer uma tabela fora de `allowedTables`. `member_audit` e `member_suspensions`
    // nascem na migration `member_management`; esquecer de listá-las quebraria o backup do dia seguinte ao Database deploy.
    expect(config.dump.allowedTables).toEqual(
      expect.arrayContaining(['public.member_audit', 'public.member_suspensions']),
    );
    expect(config.dump.excludeTables).not.toContain('public.member_audit');
    expect(config.dump.excludeTables).not.toContain('public.member_suspensions');
  });

  it('as tabelas das adequações legais (etapa 8g) entram no backup: sem elas o backup diário falharia', () => {
    // `terms_acceptances` (aceite dos Termos) e `account_deletions` (registro mínimo de exclusões, para reaplicar as
    // exclusões depois de restaurar um backup mais antigo) nascem na migration `legal_compliance`.
    expect(config.dump.allowedTables).toEqual(
      expect.arrayContaining(['public.terms_acceptances', 'public.account_deletions']),
    );
    expect(config.dump.excludeTables).not.toContain('public.terms_acceptances');
    expect(config.dump.excludeTables).not.toContain('public.account_deletions');
  });

  it('as tabelas da página Sobre editável (etapa 8j) entram no backup: sem elas o backup diário falharia', () => {
    // `site_pages` (publicado), `site_page_drafts` (rascunho) e `site_page_revisions` (as 20 últimas versões)
    // nascem na migration `site_about_page`. O texto e o histórico vão para o backup; a FOTO não (arquivos do
    // Storage ficam de fora, e a foto se reenvia pelo painel).
    expect(config.dump.allowedTables).toEqual(
      expect.arrayContaining([
        'public.site_pages',
        'public.site_page_drafts',
        'public.site_page_revisions',
      ]),
    );
    for (const table of ['site_pages', 'site_page_drafts', 'site_page_revisions']) {
      expect(config.dump.excludeTables).not.toContain(`public.${table}`);
    }
  });

  it('o registro mínimo de exclusões é expurgado com a MESMA retenção das cópias semanais (o número do SQL é o da configuração)', () => {
    // Uma linha de `account_deletions` só serve enquanto algum backup ainda guarda a conta: no máximo a retenção
    // semanal (a mais longa). O número vive em `purge_account_deletions()` (migration) e em `retentionDays.weekly`.
    const dir = 'supabase/migrations';
    let days: number | null = null;
    for (const file of readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const sql = readFileSync(`${dir}/${file}`, 'utf8').replace(/--[^\n]*/g, '');
      const fn = sql.match(
        /create\s+(?:or\s+replace\s+)?function\s+public\.purge_account_deletions\(\)[\s\S]*?\$\$;/i,
      );
      if (!fn) continue;
      const interval = fn[0].match(
        /delete\s+from\s+public\.account_deletions\s+where\s+deleted_at\s*<\s*now\(\)\s*-\s*interval\s+'(\d+)\s+days'/i,
      );
      expect(
        interval,
        `${file}: a purga precisa ser "deleted_at < now() - interval 'N days'"`,
      ).not.toBeNull();
      days = Number(interval![1]);
    }
    expect(days).not.toBeNull();
    expect(days).toBe(config.retentionDays.weekly);
  });

  it('sessões e tokens do Auth ficam fora do backup', () => {
    expect(config.dump.excludeTables).toEqual(
      expect.arrayContaining([
        'auth.sessions',
        'auth.refresh_tokens',
        'auth.one_time_tokens',
        'auth.audit_log_entries',
      ]),
    );
  });

  it('preflight: prefixo próprio, nunca o de daily/ nem o de weekly/, e frase-senha com tamanho mínimo', () => {
    const { prefix, passphraseMinLength } = config.preflight;
    expect(prefix).toMatch(/^[A-Za-z0-9_-]+\/$/);
    for (const other of [config.prefixes.daily, config.prefixes.weekly]) {
      expect(prefix.startsWith(other)).toBe(false);
      expect(other.startsWith(prefix)).toBe(false);
    }
    expect(Number.isInteger(passphraseMinLength) && passphraseMinLength >= 12).toBe(true);
  });
});
