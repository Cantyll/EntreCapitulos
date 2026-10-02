'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { DISPLAY_NAME_MAX, normalizeDisplayName } from '@/lib/auth/display-name';
import { logFailure } from '@/lib/auth/log';
import { redirectTo } from '@/lib/auth/redirect';
import { requireUser, requireUserId } from '@/lib/auth/session';
import {
  ACCOUNT_MESSAGES,
  classifyDeleteAccountError,
  isDeleteConfirmed,
} from '@/lib/account/messages';
import { getPublicSessions } from '@/lib/public/queries';
import { invalidateComments } from '@/lib/public/tags';
import { createClient } from '@/lib/supabase/server';

/*
 * Ações da página "Minha conta". Nenhuma recebe id de pessoa: tudo age sobre quem está logado (o RLS e as
 * funções do banco conferem de novo). Nunca registrar nome, e-mail ou texto de comentário no log.
 */

export type AccountNameState =
  | { status: 'idle'; message: ''; value: string }
  | { status: 'ok' | 'error'; message: string; value: string };

const NAME_MESSAGES = {
  empty: 'Escreva como devemos chamar você.',
  too_long: `Use no máximo ${DISPLAY_NAME_MAX} caracteres.`,
  looks_like_email: 'Use um nome, não um e-mail: ele aparece para qualquer visitante.',
  save_failed: 'Não foi possível salvar agora. Tente de novo em instantes.',
} as const;

/** Troca o nome público. Mesmas regras do /boas-vindas (sem "@", até 60 caracteres). */
export async function saveAccountName(
  _previous: AccountNameState,
  formData: FormData,
): Promise<AccountNameState> {
  // Identidade pelo JWT, sem ler o perfil: um perfil lido antes ficaria memoizado (ver getCurrentUser).
  const userId = await requireUserId();
  const raw = formData.get('displayName');
  const typed = typeof raw === 'string' ? raw : '';

  const result = normalizeDisplayName(raw);
  if (!result.ok) return { status: 'error', message: NAME_MESSAGES[result.error], value: typed };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: result.value, display_name_confirmed_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
  } catch (error) {
    logFailure('profiles.update (conta)', error);
    return { status: 'error', message: NAME_MESSAGES.save_failed, value: result.value };
  }

  // O cabeçalho vive no layout público (ver /boas-vindas). O nome nos comentários em cache pode levar
  // até 5 minutos para mudar (a rede de segurança do cache).
  revalidatePath('/', 'layout');
  return { status: 'ok', message: 'Nome atualizado.', value: result.value };
}

export type DeleteAccountState = { error: string | null };

/** Cookies do site e do Supabase Auth que somem junto com a conta (o `ec_next` só vive 10 minutos, entre o clique no Google e a volta). */
function isSiteCookie(name: string): boolean {
  return name.startsWith('sb-') || name === 'ec_progress';
}

/**
 * Exclui a conta de quem está logado. Confirmação digitada, conferida aqui também. A função do banco
 * (`delete_my_account`) recusa login anônimo e equipe, e apaga em cascata perfil, comentários, as
 * respostas ligadas a eles e o progresso. Depois a sessão é encerrada e os cookies do site, limpos.
 */
export async function deleteAccount(
  _previous: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await requireUser();
  if (user.role !== 'member') return { error: ACCOUNT_MESSAGES.staff };
  if (!isDeleteConfirmed(formData.get('confirmation'))) return { error: ACCOUNT_MESSAGES.confirm };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      const key = classifyDeleteAccountError(error);
      if (key === 'generic') logFailure('account.delete', error);
      return { error: ACCOUNT_MESSAGES[key] };
    }

    // A conta já não existe: o signOut local pode reclamar do token, e tudo bem. Os cookies saem de qualquer jeito.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      logFailure('account.delete signOut', error);
    }
    const store = await cookies();
    for (const { name } of store.getAll()) if (isSiteCookie(name)) store.delete(name);
  } catch (error) {
    logFailure('account.delete', error);
    return { error: ACCOUNT_MESSAGES.generic };
  }

  // Os comentários e as respostas apagados podem estar nas páginas em cache: expira a lista de cada
  // sessão pública e as contagens. Falhar aqui não desfaz nada (o cache expira sozinho em 5 minutos).
  try {
    const sessions = await getPublicSessions();
    for (const session of sessions) invalidateComments(session.id);
    invalidateComments();
  } catch (error) {
    logFailure('account.delete invalidate', error);
  }
  revalidatePath('/', 'layout');
  redirectTo('/conta/excluida');
}
