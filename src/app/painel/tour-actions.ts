'use server';

import { TOUR_VERSION } from '@/content/tour/version';
import { logFailure } from '@/lib/auth/log';
import { requireRole } from '@/lib/auth/session';
import { TOUR_MESSAGES, classifyTourError } from '@/lib/tour/errors';
import { createClient } from '@/lib/supabase/server';

export type MarkTourSeenResult = { ok: true; seen: number } | { ok: false; message: string };

/**
 * Guarda que esta pessoa da equipe viu o tutorial do painel (etapa 8k). O cliente não manda nada: a versão é a do
 * código (`TOUR_VERSION`) e a função do banco só AUMENTA o valor (rever o tutorial nunca o reinicia). Não muda nada
 * público (por isso não expira cache) e, de propósito, não refaz a página: o editor de sessão aberto não pode ser
 * montado de novo (perderia o texto ainda não enviado). Falhar aqui não atrapalha o tutorial: no pior caso o cartão
 * "Quer um tour rápido?" volta na próxima visita.
 */
export async function markTourSeenAction(): Promise<MarkTourSeenResult> {
  await requireRole('staff');
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('mark_tour_seen', { p_version: TOUR_VERSION });
    if (error) {
      const key = classifyTourError(error);
      if (key === 'generic') logFailure('tutorial: marcar como visto', error);
      return { ok: false, message: TOUR_MESSAGES[key] };
    }
    return { ok: true, seen: typeof data === 'number' ? data : TOUR_VERSION };
  } catch (error) {
    logFailure('tutorial: marcar como visto', error);
    return { ok: false, message: TOUR_MESSAGES.generic };
  }
}
