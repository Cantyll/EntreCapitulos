'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/** Sai só neste aparelho: sair no Mac não desloga o app do iPhone. */
export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) console.warn('[auth] signOut', { code: error.code ?? error.status });
  redirect('/');
}
