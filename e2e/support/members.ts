import type { Page } from '@playwright/test';

import { TERMS_VERSION } from '../../src/content/legal/version';

import { lit, sql } from './db';

let counter = 0;

/** Texto único, para achar só as pessoas de ESTE teste no meio das dos outros (a lista de membros é global). */
export function unique(label: string): string {
  counter += 1;
  return `${label}${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}`.replace(
    /[^A-Za-z0-9]/g,
    '',
  );
}

/** Comentário inserido direto no banco numa sessão do pool: só prepara dados para o teste. */
export function insertComment(options: {
  slug: string;
  authorId: string;
  body: string;
  parentId?: string;
  status?: 'approved' | 'pending' | 'removed';
}): string {
  return sql(
    `insert into public.comments (session_id, author_id, parent_id, body, read_up_to, status)
     select s.id, ${lit(options.authorId)}, ${options.parentId ? lit(options.parentId) : 'null'}, ${lit(options.body)}, 0, ${lit(options.status ?? 'approved')}
       from public.reading_sessions s join public.books b on b.id = s.book_id where b.slug = ${lit(options.slug)}
     returning id;`,
  ).split('\n')[0]!;
}

export function suspendBySql(userId: string): void {
  sql(
    `insert into public.member_suspensions (user_id) values (${lit(userId)}) on conflict do nothing;`,
  );
}

export function isSuspended(userId: string): boolean {
  return (
    sql(`select count(*) from public.member_suspensions where user_id = ${lit(userId)};`) === '1'
  );
}

export function roleOf(userId: string): string {
  return sql(`select role from public.profiles where id = ${lit(userId)};`);
}

export function auditCount(targetId: string, action: string): number {
  return Number(
    sql(
      `select count(*) from public.member_audit where target_id = ${lit(targetId)} and action = ${lit(action)};`,
    ),
  );
}

/**
 * Cria `count` contas de uma vez (SQL direto em `auth.users`; o gatilho do banco cria os perfis) com nomes
 * `<prefixo> NN`, todas com o nome confirmado e os Termos aceitos. Para testar a paginação sem 26 chamadas à API de administração.
 */
export function createBulkMembers(prefix: string, count: number, token: string): void {
  sql(`
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
    select gen_random_uuid(), 'authenticated', 'authenticated',
           'lote' || g || '+' || ${lit(token)} || '@teste.example',
           jsonb_build_object('display_name', ${lit(prefix)} || ' ' || lpad(g::text, 2, '0')),
           now(), now(), now()
      from generate_series(1, ${Number(count)}) g;
    update public.profiles set display_name_confirmed_at = now()
     where display_name like ${lit(`${prefix} %`)};
    insert into public.terms_acceptances (user_id, version)
    select id, ${lit(TERMS_VERSION)} from public.profiles where display_name like ${lit(`${prefix} %`)};
  `);
}

/** O que a página mostra no topo (os quatro números), na ordem da tela. */
export async function readStats(page: Page): Promise<Record<string, number>> {
  const entries = await page
    .locator('[data-tour="members-stats"] > div')
    .evaluateAll((nodes) =>
      nodes.map((node) => [
        node.querySelector('dt')!.textContent!.trim(),
        node.querySelector('dd')!.textContent!.trim(),
      ]),
    );
  return Object.fromEntries(
    entries.map(([label, value]) => [label, Number(String(value).replace(/\./g, ''))]),
  );
}
