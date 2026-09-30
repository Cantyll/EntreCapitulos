'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/** Sai só deste aparelho (`local`): o padrão do Supabase encerraria a sessão em todos. */
export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) console.error('auth.signOut falhou', { code: error.code, status: error.status });
  redirect('/');
}
