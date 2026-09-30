'use server';

import { redirect } from 'next/navigation';

import { DISPLAY_NAME_ERRORS, normalizeDisplayName } from '@/lib/auth/display-name';
import { safeNext } from '@/lib/auth/safe-next';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/** `value` devolve o que a pessoa digitou: o React limpa o formulário depois da action. */
export type DisplayNameState = { error: string | null; value?: string };

const GENERIC_ERROR = 'Não foi possível salvar agora. Tente de novo em alguns instantes.';

/** Grava o nome público e marca como confirmado. Só a própria pessoa (RLS e grant por coluna). */
export async function saveDisplayName(
  _previous: DisplayNameState,
  formData: FormData,
): Promise<DisplayNameState> {
  const user = await requireUser();
  const raw = formData.get('display_name');
  const value = typeof raw === 'string' ? raw : '';
  const name = normalizeDisplayName(value);
  if (!name.ok) return { error: DISPLAY_NAME_ERRORS[name.error], value };

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name.value, display_name_confirmed_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) {
    console.warn('[auth] saveDisplayName', { code: error.code });
    return { error: GENERIC_ERROR, value };
  }

  redirect(safeNext(formData.get('next')));
}
