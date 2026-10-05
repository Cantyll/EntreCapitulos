/*
 * Busca de membros. O texto digitado vira, no máximo, um prefixo do nome de exibição. Um texto com "@" nunca é
 * busca por nome: é busca por e-mail exato, que vai por POST (Server Action) e nunca entra na URL nem no log.
 * O nome de exibição não aceita "@" (`normalizeDisplayName`), então o "@" separa as duas buscas sem ambiguidade.
 */

export const MEMBER_SEARCH_MAX = 60;

// Controle, DEL e invisíveis: zero-width (U+200B a U+200D, U+2060, U+FEFF), marcas de direção (U+200E, U+200F,
// U+202A a U+202E, U+2066 a U+2069) e o hífen suave (U+00AD). A mesma lista do texto dos comentários.
const INVISIBLE =
  /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

/** Texto limpo: NFC, sem controle nem invisíveis, espaços colapsados, sem espaço nas pontas, até 60 code points. */
export function cleanSearchText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const text = raw.normalize('NFC').replace(/\s+/g, ' ').replace(INVISIBLE, '').trim();
  return Array.from(text).slice(0, MEMBER_SEARCH_MAX).join('').trim();
}

/** O texto digitado parece um e-mail (tem "@")? Então a busca é por e-mail exato, via POST. */
export function looksLikeEmail(raw: unknown): boolean {
  return typeof raw === 'string' && raw.includes('@');
}

/**
 * Termo da busca por nome vindo da URL (`?busca=`). Um texto com "@" é descartado (vira lista sem busca): um
 * e-mail digitado ou colado ali nunca deve ser usado, mesmo que a URL já tenha sido aberta.
 */
export function parseNameSearch(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const text = cleanSearchText(value);
  return looksLikeEmail(text) ? '' : text;
}

/**
 * Prefixo para o `ilike` do PostgREST: `\`, `%` e `_` perdem o poder de curinga (escapados com `\`, o escape
 * padrão do LIKE) e `*`, que o PostgREST troca por `%`, vira `_` (qualquer caractere, o que ainda casa com o `*`).
 */
export function likePrefix(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (char) => `\\${char}`).replace(/\*/g, '_');
  return `${escaped}%`;
}
