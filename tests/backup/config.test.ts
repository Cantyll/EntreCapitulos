import { readFileSync } from 'node:fs';

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

  it('as tabelas da gestão de membros (etapa 8f) entram no backup: sem elas o backup diário falharia', () => {
    // O backup falha se o dump trouxer uma tabela fora de `allowedTables`. `member_audit` e `member_suspensions`
    // nascem na migration `member_management`; esquecer de listá-las quebraria o backup do dia seguinte ao Database deploy.
    expect(config.dump.allowedTables).toEqual(
      expect.arrayContaining(['public.member_audit', 'public.member_suspensions']),
    );
    expect(config.dump.excludeTables).not.toContain('public.member_audit');
    expect(config.dump.excludeTables).not.toContain('public.member_suspensions');
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
