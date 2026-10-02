import 'server-only';

import { forbidden } from 'next/navigation';
import { headers } from 'next/headers';
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

import { PATH_HEADER } from './constants';
import { CurrentUserError } from './failure';
import { redirectTo } from './redirect';
import { hasRole, parseRole, type Role, type RoleRequirement } from './roles';
import { signInPath } from './safe-next';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CurrentUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  /** A pessoa já escolheu o nome público (`/boas-vindas`)? Sem isso o banco recusa o comentário. */
  nameConfirmed: boolean;
};

/**
 * Quem é a pessoa, pelo JWT verificado (`getClaims()`), sem ler o perfil. Memoizado por
 * requisição. Login anônimo do Supabase conta como deslogado.
 */
const getSignedInUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || claims.is_anonymous === true) return null;
  return claims.sub;
});

/**
 * Quem está logado. A identidade vem de `getClaims()` (JWT verificado); o papel e o nome vêm do
 * banco, sob RLS (`profiles`), nunca do JWT nem de metadata. Memoizado por requisição: dentro de
 * uma mesma requisição o perfil não muda. Uma Server Action que grava o perfil NÃO deve chamar
 * isto antes de gravar (use `requireUserId`), senão o perfil antigo fica memoizado e é ele que
 * o resto da requisição, inclusive o cabeçalho da página para onde ela redireciona, enxerga.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const id = await getSignedInUserId();
  if (!id) return null;

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, role, display_name_confirmed_at')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new CurrentUserError(error.code);
  if (!profile) return null;

  return {
    id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    role: parseRole(profile.role),
    nameConfirmed: profile.display_name_confirmed_at !== null,
  };
});

/**
 * A pessoa já escolheu o nome público? A coluna `display_name_confirmed_at` já existe na nuvem, então
 * qualquer erro de leitura (inclusive coluna inexistente, 42703) falha de forma visível, sem reserva.
 */
export async function isNameConfirmed(
  userId: string,
  client?: SupabaseServerClient,
): Promise<boolean> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name_confirmed_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(`profiles_read_failed:${error.code}`);
  return data?.display_name_confirmed_at != null;
}

async function requestedPath(): Promise<string> {
  return (await headers()).get(PATH_HEADER) ?? '/';
}

/**
 * Exige login e devolve só o id, sem ler o perfil. É o que uma Server Action que grava o próprio
 * perfil deve usar: ver o aviso em `getCurrentUser`.
 */
export async function requireUserId(): Promise<string> {
  const id = await getSignedInUserId();
  if (!id) redirectTo(signInPath(await requestedPath()));
  return id;
}

/** Exige login. Sem sessão, vai para /entrar e volta para a página pedida depois. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirectTo(signInPath(await requestedPath()));
  return user;
}

/**
 * Exige um papel. Use em todo layout, página e Server Action do painel: o proxy só redireciona por
 * conveniência, e a autorização real é esta (mais o RLS do banco). Sem permissão, responde 403.
 */
export async function requireRole(requirement: RoleRequirement): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user.role, requirement)) forbidden();
  return user;
}
