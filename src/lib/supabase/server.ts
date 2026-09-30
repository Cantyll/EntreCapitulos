import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from './database.types';
import { getSupabaseEnv } from './env';

/**
 * Cliente do Supabase para Server Components, Server Actions e Route Handlers. Usa só a chave
 * pública: quem decide o que cada pessoa pode fazer é o RLS do banco.
 *
 * Para saber quem é a pessoa, valide com `supabase.auth.getClaims()` (ou `getUser()`). Nunca use
 * `getSession()` para autorizar: ele lê o cookie sem validar.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Em Server Components o Next não deixa gravar cookies. O refresh da sessão fica no
          // proxy (src/proxy.ts), então ignorar aqui é seguro.
        }
      },
    },
  });
}
