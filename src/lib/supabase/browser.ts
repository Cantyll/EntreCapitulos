import { createBrowserClient } from '@supabase/ssr';

import type { Database } from './database.types';
import { getSupabaseEnv } from './env';

/** Cliente do Supabase para Client Components. Só a chave pública; o RLS protege os dados. */
export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
