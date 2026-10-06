'use server';

import { revalidatePath } from 'next/cache';

import { DISPLAY_NAME_MAX, normalizeDisplayName } from '@/lib/auth/display-name';
import { logAuthFailure, logFailure } from '@/lib/auth/log';
import { redirectTo } from '@/lib/auth/redirect';
import { safeNext } from '@/lib/auth/safe-next';
import { isNameConfirmed, requireUserId } from '@/lib/auth/session';
import { TERMS_VERSION } from '@/content/legal/version';
import { TERMS_MESSAGES, classifyAcceptError, needsTermsNotice } from '@/lib/terms';
import { readTermsStatus } from '@/lib/terms/server';
import { createClient } from '@/lib/supabase/server';

export type WelcomeState = { error: string | null; value: string };

const MESSAGES = {
  empty: 'Escreva como devemos chamar você.',
  too_long: `Use no máximo ${DISPLAY_NAME_MAX} caracteres.`,
  looks_like_email: 'Use um nome, não um e-mail: ele aparece para qualquer visitante.',
  save_failed: 'Não foi possível salvar agora. Tente de novo em instantes.',
} as const;

/**
 * Primeiro acesso e aceite dos Termos, no mesmo passo. O SERVIDOR decide o que falta (o cliente não diz): o nome, se
 * ainda não foi confirmado, e o aceite, se a pessoa nunca aceitou ou aceitou uma versão antiga.
 *  - Nome: grava o nome público e marca como confirmado (o RLS só deixa a pessoa alterar o próprio perfil).
 *  - Aceite: a caixa precisa estar marcada (conferido AQUI, antes de chamar o banco) e `accept_terms` recebe a
 *    versão do código (`TERMS_VERSION`), nunca a do formulário. É uma declaração de ter 18 anos ou mais: o site
 *    não a verifica.
 * O nome é gravado primeiro: se o aceite falhar (ou o banco ainda não tiver a função), o nome já está salvo e a
 * pessoa repete só a caixa. Se a leitura do aceite falhar (`unknown`), nada é pedido nem gravado.
 */
export async function completeWelcome(
  _prev: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  const userId = await requireUserId();
  const raw = formData.get('displayName');
  const typed = typeof raw === 'string' ? raw : '';

  // Sem memoização (`readTermsStatus`, não `getTermsStatus`): a página do redirect não pode enxergar o estado de antes.
  const [nameConfirmed, status] = await Promise.all([
    isNameConfirmed(userId),
    readTermsStatus(userId),
  ]);
  const askName = !nameConfirmed;
  const askTerms = needsTermsNotice(status);

  let name: string | null = null;
  if (askName) {
    const result = normalizeDisplayName(raw);
    if (!result.ok) return { error: MESSAGES[result.error], value: typed };
    name = result.value;
  }
  if (askTerms && formData.get('acceptTerms') !== 'on') {
    return { error: TERMS_MESSAGES.required, value: name ?? typed };
  }

  const supabase = await createClient();

  if (name !== null) {
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name, display_name_confirmed_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      logAuthFailure('profiles.update (boas-vindas)', error);
      return { error: MESSAGES.save_failed, value: name };
    }
  }

  if (askTerms) {
    const { error } = await supabase.rpc('accept_terms', { p_version: TERMS_VERSION });
    if (error) {
      const key = classifyAcceptError(error);
      if (key === 'generic') logFailure('terms.accept', error);
      // O nome (se havia) já foi salvo: o cabeçalho precisa mostrá-lo mesmo assim.
      if (name !== null) revalidatePath('/', 'layout');
      return { error: TERMS_MESSAGES[key], value: name ?? typed };
    }
  }

  // O cabeçalho mora no layout público, que o Next guarda e não renderiza de novo ao navegar entre
  // as páginas. Sem isto ele continua mostrando "Leitor" até a pessoa sair e entrar, e o aviso dos Termos
  // continua aparecendo. A invalidação vem ANTES do redirect (que interrompe a função) e também limpa o cache
  // do navegador.
  revalidatePath('/', 'layout');
  redirectTo(safeNext(formData.get('next')));
}
