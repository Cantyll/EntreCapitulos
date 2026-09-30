import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { PATH_HEADER } from '@/lib/auth/constants';
import { signInPath } from '@/lib/auth/safe-next';
import type { Database } from '@/lib/supabase/database.types';
import { getSupabaseEnv } from '@/lib/supabase/env';

function inPanel(pathname: string) {
  return pathname === '/painel' || pathname.startsWith('/painel/');
}

/**
 * Roda antes de cada página:
 * 1. Renova a sessão do Supabase (refresh do token) e grava os cookies novos na resposta.
 * 2. Em /painel, manda quem não está logado para /entrar?next=… (só conveniência: quem autoriza
 *    de verdade é `requireRole()` na página e o RLS no banco). O papel não é checado aqui.
 * 3. Repassa o caminho pedido num cabeçalho interno, sempre sobrescrito aqui.
 */
export async function proxy(request: NextRequest) {
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set(PATH_HEADER, path);
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();
  const cacheHeaders: Record<string, string> = {};

  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // A página desta mesma requisição já lê a sessão renovada...
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = forward();
        // ...e o navegador recebe os cookies novos, sem cache em CDN.
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        Object.assign(cacheHeaders, headers);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // getClaims() valida o JWT (e renova a sessão se for preciso). Não coloque nada entre o
  // createServerClient e esta chamada.
  const { data, error } = await supabase.auth.getClaims();

  // Se o Auth estiver fora do ar (erro), a requisição segue: a camada de dados falha fechada.
  const signedOut = !error && (!data?.claims || data.claims.is_anonymous === true);

  if (signedOut && inPanel(request.nextUrl.pathname)) {
    const redirect = NextResponse.redirect(new URL(signInPath(path), request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [key, value] of Object.entries(cacheHeaders)) redirect.headers.set(key, value);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    // Tudo, menos arquivos estáticos, imagens, ícones e o manifest.
    '/((?!_next/static|_next/image|icons/|icon$|apple-icon$|manifest\\.webmanifest$|favicon\\.ico$|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml)$).*)',
  ],
};
