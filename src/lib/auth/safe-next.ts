/*
 * O parâmetro `next` diz para onde voltar depois do login. Só aceitamos caminhos internos: qualquer
 * outra coisa (URL completa, `//host`, `javascript:`...) cai em "/". O resultado é sempre montado
 * a partir do `URL` interpretado, nunca devolvido como veio.
 */

const FALLBACK = '/';
const BASE = 'http://internal.invalid';
// Rotas de autenticação: voltar para elas depois do login criaria um laço.
const AUTH_PATHS = ['/entrar', '/auth', '/boas-vindas'];

// Caracteres de controle e barra invertida: o parser de URL os normaliza (`/\t/host` vira `//host`).
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f\\]/;

export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return FALLBACK;
  if (!value.startsWith('/') || value.startsWith('//')) return FALLBACK;
  if (FORBIDDEN_CHARS.test(value)) return FALLBACK;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== BASE) return FALLBACK;

  // Depois do parse (e de decodificar `%2F`, `%5C`), o caminho ainda precisa ser interno e limpo.
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return FALLBACK;
  }
  if (decoded.startsWith('//') || FORBIDDEN_CHARS.test(decoded)) return FALLBACK;

  const lower = url.pathname.toLowerCase();
  if (AUTH_PATHS.some((p) => lower === p || lower.startsWith(`${p}/`))) return FALLBACK;

  return `${url.pathname}${url.search}${url.hash}`;
}

/** Para onde ir depois de entrar: quem ainda não escolheu o nome passa por /boas-vindas. */
export function postLoginDestination(next: unknown, nameConfirmed: boolean): string {
  const safe = safeNext(next);
  if (nameConfirmed) return safe;
  return safe === FALLBACK ? '/boas-vindas' : `/boas-vindas?next=${encodeURIComponent(safe)}`;
}

/** Caminho do login com o `next` já validado. */
export function signInPath(next: unknown): string {
  const safe = safeNext(next);
  return safe === FALLBACK ? '/entrar' : `/entrar?next=${encodeURIComponent(safe)}`;
}
