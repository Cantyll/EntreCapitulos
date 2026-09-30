import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { forbidden, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { cache } from 'react';

import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

import { PATH_HEADER } from './constants';
import { hasRole, parseRole, type Role, type RoleRequirement } from './roles';
import { signInPath } from './safe-next';

export type CurrentUser = {
  id: string;
  role: Role;
  displayName: string;
  avatarUrl: string | null;
  /** Já escolheu o nome público em /boas-vindas. Sem isso o banco não deixa comentar. */
  nameConfirmed: boolean;
};

/** Postgres: coluna inexistente. */
const UNDEFINED_COLUMN = '42703';

/**
 * Lê o perfil sob RLS. O papel vem daqui, nunca do JWT.
 *
 * Entre o merge e a aplicação da migration na nuvem, `display_name_confirmed_at` ainda não existe
 * lá. Só esse erro (42703) é tratado, como "nome confirmado", para o login funcionar na
 * pré-visualização. Qualquer outro erro é lançado. Só o código do erro vai para o log.
 */
export async function readProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CurrentUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, display_name, avatar_url, display_name_confirmed_at')
    .eq('id', userId)
    .maybeSingle();

  if (error?.code === UNDEFINED_COLUMN) {
    console.warn('[auth] profiles.display_name_confirmed_at ausente', { code: error.code });
    const fallback = await supabase
      .from('profiles')
      .select('role, display_name, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    if (fallback.error) throw new Error(`profile_read_failed:${fallback.error.code}`);
    if (!fallback.data) return null;
    return {
      id: userId,
      role: parseRole(fallback.data.role),
      displayName: fallback.data.display_name,
      avatarUrl: fallback.data.avatar_url,
      nameConfirmed: true,
    };
  }

  if (error) throw new Error(`profile_read_failed:${error.code}`);
  if (!data) return null;
  return {
    id: userId,
    role: parseRole(data.role),
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    nameConfirmed: data.display_name_confirmed_at !== null,
  };
}

/** Identidade validada com getClaims(). Login anônimo conta como deslogado. */
export async function getVerifiedUserId(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  if (data.claims.is_anonymous === true) return null;
  return typeof data.claims.sub === 'string' ? data.claims.sub : null;
}

/** Quem está logado nesta requisição (memoizado por requisição), ou `null`. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const userId = await getVerifiedUserId(supabase);
  if (!userId) return null;
  return readProfile(supabase, userId);
});

/** Caminho atual, repassado pelo proxy, para o login voltar a ele. */
async function currentPath(): Promise<string> {
  return (await headers()).get(PATH_HEADER) ?? '/';
}

/** Exige login. Sem sessão, vai para /entrar e volta para a página atual depois. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(await currentPath()));
  return user;
}

/**
 * Exige login e papel. Sem papel suficiente, responde 403 (`forbidden.tsx`). Use em todo layout,
 * página e Server Action do painel.
 */
export async function requireRole(requirement: RoleRequirement): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user.role, requirement)) forbidden();
  return user;
}
