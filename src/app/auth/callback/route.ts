import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { NEXT_COOKIE, NEXT_COOKIE_PATH } from '@/lib/auth/constants';
import { logAuthFailure } from '@/lib/auth/log';
import type { LoginErrorCode } from '@/lib/auth/messages';
import { postLoginDestination, safeNext } from '@/lib/auth/safe-next';
import { isNameConfirmed } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/** Volta do Google: troca o `code` (PKCE) por sessão e segue para o destino validado. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const cookieStore = await cookies();

  // O cookie é de uso único e o valor é revalidado: quem o adulterasse cairia em "/".
  const next = safeNext(cookieStore.get(NEXT_COOKIE)?.value);
  cookieStore.set(NEXT_COOKIE, '', { path: NEXT_COOKIE_PATH, maxAge: 0 });

  const fail = (erro: LoginErrorCode) => {
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    url.search = `?erro=${erro}${next === '/' ? '' : `&next=${encodeURIComponent(next)}`}`;
    return NextResponse.redirect(url);
  };

  if (searchParams.get('error') === 'access_denied') return fail('acesso_negado');

  const code = searchParams.get('code');
  if (!code) return fail('oauth');

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let userId: string;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      if (error) logAuthFailure('auth.exchangeCodeForSession', error);
      return fail('oauth');
    }
    userId = data.user.id;
  } catch (error) {
    logAuthFailure('auth.exchangeCodeForSession', error);
    return fail('oauth');
  }

  const confirmed = await isNameConfirmed(userId, supabase);
  const url = request.nextUrl.clone();
  const destination = new URL(postLoginDestination(next, confirmed), request.nextUrl.origin);
  url.pathname = destination.pathname;
  url.search = destination.search;
  url.hash = '';
  return NextResponse.redirect(url);
}
