import 'server-only';

import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';

import { logFailure } from '@/lib/auth/log';
import { createClient } from '@/lib/supabase/server';

import { isTermsUnavailable } from './errors';
import { classifyTermsRow, type TermsStatus } from './status';

/**
 * Lê, sob o RLS, a linha de aceite da PRÓPRIA pessoa. Não é memoizada: use esta numa Server Action que grava o aceite
 * (a página para onde ela redireciona não pode enxergar o estado de antes). Qualquer falha vira `unknown` (nunca
 * avisa nem bloqueia): tabela ausente (migration ainda não aplicada) em silêncio; outra falha, registrada só pelo
 * código (nunca o id da pessoa).
 */
export async function readTermsStatus(userId: string): Promise<TermsStatus> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('terms_acceptances')
      .select('version')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      if (!isTermsUnavailable(error)) logFailure('terms.status', error);
      return 'unknown';
    }
    return classifyTermsRow(data?.version);
  } catch (error) {
    unstable_rethrow(error);
    logFailure('terms.status', error);
    return 'unknown';
  }
}

/** O mesmo, memoizado por requisição: o aviso do layout, a discussão e `/boas-vindas` leem uma vez só. */
export const getTermsStatus = cache(readTermsStatus);
