import 'server-only';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/database.types';
import { getSupabaseEnv } from '@/lib/supabase/env';

/**
 * Cliente do Supabase SEM cookies e sem sessão: enxerga só o que o RLS libera para o visitante
 * (livros e sessões publicadas e públicas). Por isso o resultado vale para todo mundo e pode ir para
 * o cache compartilhado. NUNCA use este cliente para dado por pessoa, e NUNCA leia cookies dentro
 * de uma função cacheada.
 */
export function createPublicClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
