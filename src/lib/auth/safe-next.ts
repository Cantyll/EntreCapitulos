/**
 * Validação do parâmetro `next` (para onde voltar depois do login). Só aceita caminhos internos
 * relativos, como `/livros/o-livro-de-azrael?x=1`. Qualquer outra coisa vira "/".
 *
 * Função pura: roda no proxy, em Server Actions, em Route Handlers e nos testes.
 */

import type { Route } from 'next';

export const DEFAULT_NEXT: Route = '/';

/** Páginas do próprio login: voltar para elas criaria um laço. */
const LOOP_PREFIXES = ['/entrar', '/auth', '/boas-vindas'] as const;

const BASE = 'http://entrecapitulos.invalid';

function inSegment(pathname: string, segment: string) {
  return pathname === segment || pathname.startsWith(`${segment}/`);
}

export function safeNext(input: unknown): Route {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) return DEFAULT_NEXT;

  // Só caminho relativo à raiz: nada de esquema (`https:`, `javascript:`) nem `//host`.
  if (!input.startsWith('/') || input.startsWith('//')) return DEFAULT_NEXT;

  // Barras invertidas (`/\host`), caracteres de controle e tabs viram "/" em qualquer posição.
  if (/[\\\u0000-\u001F\u007F]/.test(input)) return DEFAULT_NEXT;

  // No trecho do caminho, barra ou barra invertida codificadas (`/%2F%2Fhost`) também.
  const pathPart = input.split(/[?#]/, 1)[0] ?? '';
  if (/%(2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(pathPart)) return DEFAULT_NEXT;

  let url: URL;
  try {
    url = new URL(input, BASE);
  } catch {
    return DEFAULT_NEXT;
  }
  if (url.origin !== BASE) return DEFAULT_NEXT;
  if (LOOP_PREFIXES.some((prefix) => inSegment(url.pathname, prefix))) return DEFAULT_NEXT;

  // Reconstruído a partir do parse, nunca a entrada crua.
  return `${url.pathname}${url.search}${url.hash}` as Route;
}

/** Destino depois de entrar: quem ainda não escolheu o nome passa antes por /boas-vindas. */
export function postSignInPath(next: string, nameConfirmed: boolean): Route {
  const target = safeNext(next);
  if (nameConfirmed) return target;
  return `/boas-vindas?next=${encodeURIComponent(target)}` as Route;
}

/** Link para o login que volta para `path` depois. */
export function signInPath(path: string): Route {
  const target = safeNext(path);
  if (target === DEFAULT_NEXT) return '/entrar';
  return `/entrar?next=${encodeURIComponent(target)}` as Route;
}
