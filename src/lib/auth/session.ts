import 'server-only';

import { forbidden } from 'next/navigation';
import { headers } from 'next/headers';
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

import { PATH_HEADER } from './constants';
import { redirectTo } from './redirect';
import { hasRole, parseRole, type Role, type RoleRequirement } from './roles';
import { signInPath } from './safe-next';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CurrentUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
};

/**
 * Quem está logado. A identidade vem de `getClaims()` (JWT verificado); o papel e o nome vêm do
 * banco, sob RLS (`profiles`), nunca do JWT nem de metadata. Memoizado por requisição.
 * Login anônimo do Supabase conta como deslogado.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || claims.is_anonymous === true) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, role')
    .eq('id', claims.sub)
    .maybeSingle();

  if (error) throw new Error(`profiles_read_failed:${error.code}`);
  if (!profile) return null;

  return {
    id: claims.sub,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    role: parseRole(profile.role),
  };
});

/**
 * A pessoa já escolheu o nome público? A coluna chega com a migration
 * `profile_name_confirmation`. Enquanto a migration não foi aplicada na nuvem (por exemplo numa
 * pré-visualização), o Postgres responde 42703 (coluna inexistente) e tratamos como confirmado,
 * para o login funcionar. Nenhum outro erro é mascarado.
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

  if (error) {
    if (error.code === '42703') {
      console.warn('profiles.display_name_confirmed_at ausente (42703): migration pendente');
      return true;
    }
    throw new Error(`profiles_read_failed:${error.code}`);
  }
  return data?.display_name_confirmed_at != null;
}

async function requestedPath(): Promise<string> {
  return (await headers()).get(PATH_HEADER) ?? '/';
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
