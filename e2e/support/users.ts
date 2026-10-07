import type { BrowserContext } from '@playwright/test';

import { TERMS_VERSION } from '../../src/content/legal/version';
import { TOUR_VERSION } from '../../src/content/tour/version';

import { lit, sql } from './db';
import { keys } from './stack';

export type Role = 'member' | 'moderator' | 'admin';

export type TestUser = { id: string; email: string; name: string; role: Role };

let counter = 0;

/** E-mail único por teste (alias), para nenhum teste depender da ordem dos outros. */
export function uniqueEmail(prefix = 'pessoa'): string {
  counter += 1;
  return `${prefix}+${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}@teste.example`;
}

async function admin(path: string, body: unknown): Promise<Response> {
  const { apiUrl, secretKey } = keys();
  return fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: secretKey,
      authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Contas da equipe nascem com o tutorial do painel marcado como "já visto" (etapa 8k), para o cartão "Quer um tour
 * rápido?" não aparecer nos outros testes. Os testes do tutorial redefinem o valor (`setTutorialSeen` ou a opção
 * `tutorial: 'unseen'` de `createUser`).
 */
export function setTutorialSeen(userId: string, version: number): void {
  sql(
    `update public.profiles set tour_seen_version = ${Number(version)} where id = ${lit(userId)};`,
  );
}

export function markTutorialSeen(userId: string): void {
  setTutorialSeen(userId, TOUR_VERSION);
}

export type CreateUserOptions = {
  prefix?: string;
  /** Equipe: `'unseen'` deixa o tutorial do painel por ver (o cartão "Quer um tour rápido?" aparece). */
  tutorial?: 'seen' | 'unseen';
  /** Nome público; `null` deixa o nome por confirmar (cai em /boas-vindas). */
  name?: string | null;
  role?: Role;
  /** Comentários aprovados que a pessoa já tem (3 ou mais publica direto). */
  approved?: number;
  /**
   * Aceite dos Termos (etapa 8g). `true` (padrão): aceitou a versão atual, para o comentário e o primeiro acesso não
   * dependerem dele em outros testes. `'old'`: aceitou uma versão antiga. `false`: nunca aceitou.
   */
  terms?: boolean | 'old';
};

/** Grava o aceite dos Termos da pessoa (a versão atual, ou uma antiga), como o banco de verdade o guarda. */
export function acceptTermsBySql(userId: string, version: string = TERMS_VERSION): void {
  sql(
    `insert into public.terms_acceptances (user_id, version) values (${lit(userId)}, ${lit(version)})
     on conflict (user_id) do update set version = excluded.version;`,
  );
}

/** Cria a conta pela API de administração do Auth local e ajusta o perfil por SQL. */
export async function createUser(options: CreateUserOptions = {}): Promise<TestUser> {
  const {
    prefix = 'pessoa',
    name = 'Pessoa Teste',
    role = 'member',
    approved,
    terms = true,
    tutorial = 'seen',
  } = options;
  const email = uniqueEmail(prefix);
  const response = await admin('/auth/v1/admin/users', { email, email_confirm: true });
  if (!response.ok) throw new Error(`criar usuário falhou: ${response.status}`);
  const id = ((await response.json()) as { id: string }).id;

  const sets: string[] = [];
  if (name !== null) sets.push(`display_name = ${lit(name)}`, 'display_name_confirmed_at = now()');
  if (role !== 'member') sets.push(`role = ${lit(role)}`);
  if (approved !== undefined) sets.push(`approved_comment_count = ${Number(approved)}`);
  if (sets.length) sql(`update public.profiles set ${sets.join(', ')} where id = ${lit(id)};`);
  if (terms !== false) acceptTermsBySql(id, terms === 'old' ? 'versao-antiga' : TERMS_VERSION);
  if (role !== 'member' && tutorial === 'seen') markTutorialSeen(id);

  return { id, email, name: name ?? 'Leitor', role };
}

export const createAdmin = (options: Omit<CreateUserOptions, 'role'> = {}) =>
  createUser({ prefix: 'admin', name: 'Agatha de Teste', ...options, role: 'admin' });

export const createModerator = (options: Omit<CreateUserOptions, 'role'> = {}) =>
  createUser({ prefix: 'moderadora', name: 'Moderadora de Teste', ...options, role: 'moderator' });

const CHUNK = 3180;

/** Entra sem passar pelo formulário: gera um link de acesso no Auth local, troca por sessão e grava os cookies do @supabase/ssr. */
export async function signIn(context: BrowserContext, user: TestUser): Promise<void> {
  const link = await admin('/auth/v1/admin/generate_link', {
    type: 'magiclink',
    email: user.email,
  });
  if (!link.ok) throw new Error(`generate_link falhou: ${link.status}`);
  const hashed = ((await link.json()) as { hashed_token: string }).hashed_token;
  const verify = await admin('/auth/v1/verify', { type: 'magiclink', token_hash: hashed });
  if (!verify.ok) throw new Error(`verify falhou: ${verify.status}`);
  const session = (await verify.json()) as Record<string, unknown>;

  const name = 'sb-localhost-auth-token';
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const parts = value.length <= CHUNK ? [{ name, value }] : chunk(name, value);
  await context.addCookies(
    parts.map((part) => ({
      ...part,
      domain: 'localhost',
      path: '/',
      secure: true,
      sameSite: 'Lax' as const,
    })),
  );
}

function chunk(name: string, value: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (let i = 0; i * CHUNK < value.length; i += 1) {
    out.push({ name: `${name}.${i}`, value: value.slice(i * CHUNK, (i + 1) * CHUNK) });
  }
  return out;
}
