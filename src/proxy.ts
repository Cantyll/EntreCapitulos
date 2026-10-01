import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { PATH_HEADER } from '@/lib/auth/constants';
import { isAuthOutage } from '@/lib/auth/failure';
import { logProxyFailure } from '@/lib/auth/log';
import { panelUnavailableResponse } from '@/lib/auth/panel-unavailable';
import { signInPath } from '@/lib/auth/safe-next';
import type { Database } from '@/lib/supabase/database.types';
import { getSupabaseEnv } from '@/lib/supabase/env';

/*
 * Proxy (o antigo middleware do Next). Faz duas coisas:
 *
 * 1. Renova a sessão do Supabase, porque Server Components não conseguem gravar cookies.
 * 2. Redireciona /painel e /painel/* para /entrar?next=… quando não há sessão. Isso é só
 *    conveniência: a autorização real fica em `requireRole` (src/lib/auth/session.ts) e no RLS.
 *
 * Não confere papel (exigiria banco em toda navegação).
 *
 * Nunca derruba o site público: em qualquer exceção (variável de ambiente ausente, Auth fora do
 * ar) as rotas públicas passam, e o log leva só o nome do erro. O painel falha FECHADO: sem poder
 * conferir a sessão, responde 503 e nunca libera.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Só o proxy preenche esta header: sobrescreve qualquer valor que o navegador tenha mandado.
  request.headers.set(PATH_HEADER, `${pathname}${search}`);

  const isPanel = pathname === '/painel' || pathname.startsWith('/painel/');

  try {
    return await refreshSession(request, isPanel);
  } catch (error) {
    logProxyFailure(error);
    return isPanel ? panelUnavailableResponse() : NextResponse.next({ request });
  }
}

async function refreshSession(request: NextRequest, isPanel: boolean) {
  const { pathname, search } = request.nextUrl;

  let response = NextResponse.next({ request });
  let cacheHeaders: Record<string, string> = {};

  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Cabeçalhos de cache que impedem a CDN de guardar uma resposta com Set-Cookie.
        cacheHeaders = headers;
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // O getClaims não lança quando o Auth está fora do ar: devolve o erro. Aqui ele vira exceção,
  // para cair no mesmo tratamento das outras falhas (e o painel responder 503, não ir ao login).
  const { data, error } = await supabase.auth.getClaims();
  if (error && isAuthOutage(error)) throw error;
  const signedIn = Boolean(data?.claims?.sub) && data?.claims?.is_anonymous !== true;

  if (isPanel && !signedIn) {
    const redirect = NextResponse.redirect(
      new URL(signInPath(`${pathname}${search}`), request.url),
    );
    // Mantém os cookies que o refresh possa ter apagado ou renovado.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [key, value] of Object.entries(cacheHeaders)) redirect.headers.set(key, value);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    // Tudo, menos arquivos estáticos, manifest e ícones do app.
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icon(?:/|$)|apple-icon(?:/|$)|icons/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)',
  ],
};
