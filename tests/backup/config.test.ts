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
});
