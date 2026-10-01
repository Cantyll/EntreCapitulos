import 'server-only';

import { unstable_rethrow } from 'next/navigation';

import { isAuthFailure } from './failure';
import { logAuthFailure } from './log';
import { getCurrentUser, type CurrentUser } from './session';

/**
 * `getCurrentUser` para páginas públicas que também funcionam para visitantes (o cabeçalho, a
 * tela de entrar): um Supabase mal configurado ou fora do ar não pode derrubá-las, então nesse
 * caso a pessoa é tratada como visitante. Só a configuração e as falhas do Auth caem aqui.
 * `requireUser` e `requireRole` continuam falhando fechado, e qualquer outro erro segue em frente.
 *
 * @param where Quem chamou, só para o log (por exemplo "SiteHeader").
 */
export async function getCurrentUserOrNull(where: string): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch (error) {
    // Os erros internos do Next (renderização dinâmica, redirect, notFound) não são falhas: o
    // Next precisa recebê-los de volta para continuar a renderização.
    unstable_rethrow(error);
    if (!isAuthFailure(error)) throw error;
    logAuthFailure(`${where}: getCurrentUser`, error);
    return null;
  }
}
