'use server';

import { DISPLAY_NAME_MAX, normalizeDisplayName } from '@/lib/auth/display-name';
import { redirectTo } from '@/lib/auth/redirect';
import { safeNext } from '@/lib/auth/safe-next';
import { requireUser } from '@/lib/auth/session';
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
  const user = await requireUser();
  const raw = formData.get('displayName');
  const typed = typeof raw === 'string' ? raw : '';

  const result = normalizeDisplayName(raw);
  if (!result.ok) return { error: MESSAGES[result.error], value: typed };

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: result.value, display_name_confirmed_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    console.error('profiles.update (boas-vindas) falhou', { code: error.code });
    return { error: MESSAGES.save_failed, value: result.value };
  }

  redirectTo(safeNext(formData.get('next')));
}
