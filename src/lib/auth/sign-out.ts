'use server';

import { redirect } from 'next/navigation';

import { logAuthFailure } from '@/lib/auth/log';
import { createClient } from '@/lib/supabase/server';

/** Sai só deste aparelho (`local`): o padrão do Supabase encerraria a sessão em todos. */
export async function signOut() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) logAuthFailure('auth.signOut', error);
  } catch (error) {
    logAuthFailure('auth.signOut', error);
  }
  redirect('/');
}
