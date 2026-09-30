import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { OAUTH_NEXT_COOKIE, OAUTH_NEXT_COOKIE_OPTIONS } from '@/lib/auth/constants';
import { postSignInPath, safeNext } from '@/lib/auth/safe-next';
import { readProfile } from '@/lib/auth/session';
import type { SignInPageError } from '@/lib/auth/sign-in-errors';
import { createClient } from '@/lib/supabase/server';

function fail(code: SignInPageError): never {
  redirect(`/entrar?erro=${code}`);
}

/** Volta do Google: troca o `code` pela sessão (PKCE) e segue para o `next` guardado no cookie. */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  // O cookie vale uma vez só, e o valor é validado de novo aqui.
  const next = safeNext(cookieStore.get(OAUTH_NEXT_COOKIE)?.value);
  cookieStore.set(OAUTH_NEXT_COOKIE, '', { ...OAUTH_NEXT_COOKIE_OPTIONS, maxAge: 0 });

  const params = request.nextUrl.searchParams;
  // O Google (ou o Supabase) devolve `error` quando a pessoa cancela ou algo falha.
  if (params.has('error')) fail('google');
  const code = params.get('code');
  if (!code) fail('retorno');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    if (error)
      console.warn('[auth] exchangeCodeForSession', { code: error.code, status: error.status });
    fail('retorno');
  }

  const profile = await readProfile(supabase, data.user.id);
  redirect(postSignInPath(next, profile?.nameConfirmed ?? false));
}
