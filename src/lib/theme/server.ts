import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';

import { logFailure } from '@/lib/auth/log';
import type { Database } from '@/lib/supabase/database.types';
import { getSupabaseEnv } from '@/lib/supabase/env';

import { isAccessible } from './derive';
import { parseTokens, type ThemeTokens } from './tokens';

/** Tag do cache do tema. As Server Actions que mexem em livro, capa ou tema a invalidam. */
export const THEME_TAG = 'theme';

/** Rede de segurança: mesmo sem invalidação, o tema se renova sozinho em até 5 minutos. */
const THEME_REVALIDATE_SECONDS = 300;

/**
 * Tokens do tema do livro em leitura, ou `null` (tema padrão rosa). Livros são públicos, então a
 * leitura usa um cliente SEM cookies (sem sessão): o resultado vale para todo mundo e pode ficar
 * em cache. Nunca lança por causa do tema: sem livro em leitura, com `theme_auto` desligado, com
 * tokens inválidos ou que não cumprem o contraste, ou em qualquer falha, devolve `null`.
 * Memoizado por requisição.
 */
export const getSiteTheme = cache(async (): Promise<ThemeTokens | null> => {
  try {
    const { url, publishableKey } = getSupabaseEnv();
    const supabase = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        // O fetch do Next entra no cache de dados, com tag e prazo.
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: 'force-cache',
            next: { tags: [THEME_TAG], revalidate: THEME_REVALIDATE_SECONDS },
          }),
      },
    });

    const { data, error } = await supabase
      .from('books')
      .select('theme_tokens, theme_auto')
      .eq('status', 'reading')
      .maybeSingle();
    if (error) throw error;
    if (!data?.theme_auto) return null;

    // Defesa na leitura: só a allow-list passa, e só um tema que de fato cumpre o contraste.
    const tokens = parseTokens(data.theme_tokens);
    return tokens && isAccessible(tokens) ? tokens : null;
  } catch (error) {
    // Erros internos do Next (renderização dinâmica etc.) voltam para o Next.
    unstable_rethrow(error);
    logFailure('theme: getSiteTheme', error);
    return null;
  }
});
