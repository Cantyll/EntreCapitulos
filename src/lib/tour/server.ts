import 'server-only';

import { logFailure } from '@/lib/auth/log';
import { createClient } from '@/lib/supabase/server';

import { isTourUnavailable } from './errors';

/*
 * A versão do tutorial que esta pessoa já viu (etapa 8k). Consulta SEPARADA do `getCurrentUser` de propósito:
 * antes do Database deploy a coluna não existe, e colocá-la na consulta do perfil derrubaria todo login.
 *
 * `null` = não sei (coluna ausente ou leitura que falhou). Com `null` o painel NÃO mostra o cartão "Quer um tour
 * rápido?" nem a dica do "?", e o botão "?" continua funcionando. Só a falha que não é "coluna ausente" é
 * registrada, e só pelo código.
 */
export async function getTourSeenVersion(userId: string): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('tour_seen_version')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      if (!isTourUnavailable(error)) logFailure('tutorial: leitura', error);
      return null;
    }
    const value = (data as { tour_seen_version?: unknown } | null)?.tour_seen_version;
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
  } catch (error) {
    logFailure('tutorial: leitura', error);
    return null;
  }
}
