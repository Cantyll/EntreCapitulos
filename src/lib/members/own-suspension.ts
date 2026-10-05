import 'server-only';

import { logFailure } from '@/lib/auth/log';
import { createClient } from '@/lib/supabase/server';

/**
 * Os comentários DESTA pessoa estão suspensos? Lê só a própria linha de `member_suspensions` (o RLS deixa a
 * pessoa ler a própria linha e mais nada). É o que decide se o compositor mostra o aviso em vez do campo.
 *
 * Se a leitura falhar (tabela ainda inexistente, rede), vale como "não suspenso": o aviso é só uma cortesia e o
 * banco recusa o comentário de qualquer jeito (`comments_suspended:`), então a página nunca quebra por isso. O
 * erro é registrado só pelo código (nunca o id da pessoa).
 */
export async function isOwnCommentsSuspended(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('member_suspensions')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      logFailure('members.own-suspension', error);
      return false;
    }
    return data !== null;
  } catch (error) {
    logFailure('members.own-suspension', error);
    return false;
  }
}
