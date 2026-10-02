import { execFileSync } from 'node:child_process';

import { DB_CONTAINER } from './stack';

/** Executa SQL no Postgres LOCAL (como dono do banco, sem RLS). Só para preparar e conferir dados de teste. */
export function sql(query: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-F',
      '|',
    ],
    { input: query, encoding: 'utf8' },
  ).trim();
}

/** Primeira coluna da primeira linha, como número. */
export function sqlNumber(query: string): number {
  return Number(sql(query).split('\n')[0]);
}

/** Literal de texto seguro para SQL (os valores de teste são gerados aqui, mas não custa). */
export function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
