'use server';

import { revalidatePath } from 'next/cache';

import { DISPLAY_NAME_MAX, normalizeDisplayName } from '@/lib/auth/display-name';
import { logAuthFailure } from '@/lib/auth/log';
import { redirectTo } from '@/lib/auth/redirect';
import { safeNext } from '@/lib/auth/safe-next';
import { requireUserId } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export type WelcomeState = { error: string | null; value: string };

const MESSAGES = {
  empty: 'Escreva como devemos chamar você.',
  too_long: `Use no máximo ${DISPLAY_NAME_MAX} caracteres.`,
  looks_like_email: 'Use um nome, não um e-mail: ele aparece para qualquer visitante.',
  save_failed: 'Não foi possível salvar agora. Tente de novo em instantes.',
} as const;

/** Grava o nome público e marca como confirmado. O RLS só deixa a pessoa alterar o próprio perfil. */
export async function saveDisplayName(
  _prev: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  const userId = await requireUserId();
  const raw = formData.get('displayName');
  const typed = typeof raw === 'string' ? raw : '';

  const result = normalizeDisplayName(raw);
  if (!result.ok) return { error: MESSAGES[result.error], value: typed };

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: result.value, display_name_confirmed_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    logAuthFailure('profiles.update (boas-vindas)', error);
    return { error: MESSAGES.save_failed, value: result.value };
  }

  // O cabeçalho mora no layout público, que o Next guarda e não renderiza de novo ao navegar entre
  // as páginas. Sem isto ele continua mostrando "Leitor" até a pessoa sair e entrar. A invalidação
  // vem ANTES do redirect (que interrompe a função) e também limpa o cache do navegador.
  revalidatePath('/', 'layout');
  redirectTo(safeNext(formData.get('next')));
}
