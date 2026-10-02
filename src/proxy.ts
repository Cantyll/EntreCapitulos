import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { PATH_HEADER } from '@/lib/auth/constants';
import { isAuthOutage } from '@/lib/auth/failure';
import { logProxyFailure } from '@/lib/auth/log';
import { panelUnavailableResponse } from '@/lib/auth/panel-unavailable';
import { signInPath } from '@/lib/auth/safe-next';
import type { Database } from '@/lib/supabase/database.types';
import { getTurnstileSiteKey } from '@/lib/auth/features';
import { buildCsp, generateNonce, parseReportOnly, type CspHeader } from '@/lib/security/csp';
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
 *
 * 3. Define a Content-Security-Policy com um nonce por requisição (src/lib/security/csp.ts). Isto acontece
 *    ANTES do try/catch acima e a política vai em TODA resposta (inclusive as de falha e os redirecionamentos),
 *    e o mesmo valor vai no cabeçalho da requisição, de onde o Next tira o nonce para os seus scripts: o
 *    nonce do cabeçalho nunca diverge do que o Next recebe. Se montar a política falhar, o site segue sem ela
 *    (e o log diz só o nome do erro): a CSP é uma proteção a mais e nunca derruba a navegação.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Só o proxy preenche esta header: sobrescreve qualquer valor que o navegador tenha mandado.
  request.headers.set(PATH_HEADER, `${pathname}${search}`);

  const csp = applyCsp(request);

  const isPanel = pathname === '/painel' || pathname.startsWith('/painel/');

  let response: NextResponse;
  try {
    response = await refreshSession(request, isPanel);
  } catch (error) {
    logProxyFailure(error);
    response = isPanel ? panelUnavailableResponse() : NextResponse.next({ request });
  }

  if (csp) response.headers.set(csp.name, csp.value);
  return response;
}

/**
 * Gera o nonce e a política desta requisição e os põe nos cabeçalhos da REQUISIÇÃO (é de lá que o Next lê o
 * nonce para os seus scripts; ele aceita a versão normal e a "Report-Only"). Devolve o cabeçalho que também
 * vai na RESPOSTA. Nunca lança.
 */
function applyCsp(request: NextRequest): CspHeader | null {
  // Um cabeçalho CSP mandado pelo navegador nunca vale: só o nosso.
  request.headers.delete('content-security-policy');
  request.headers.delete('content-security-policy-report-only');
  request.headers.delete('x-nonce');
  try {
    const nonce = generateNonce();
    const csp = buildCsp({
      nonce,
      production: process.env.NODE_ENV === 'production',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      vercelEnv: process.env.VERCEL_ENV,
      turnstile: getTurnstileSiteKey() !== null,
      reportOnly: parseReportOnly(process.env.CSP_REPORT_ONLY),
    });
    request.headers.set(csp.name, csp.value);
    request.headers.set('x-nonce', nonce);
    return csp;
  } catch (error) {
    logProxyFailure(error);
    return null;
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
