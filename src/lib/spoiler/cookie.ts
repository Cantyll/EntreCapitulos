import { PROGRESS_MAX } from './rules';

/*
 * Cookie de progresso do visitante (sem login). Guarda `{ "<slug do livro>": <capítulo> }` em JSON.
 * É lido e escrito só no servidor (`httpOnly`), então a leitura valida tudo: o valor veio do
 * navegador e pode ter sido mexido à mão.
 */

export const PROGRESS_COOKIE = 'ec_progress';
export const PROGRESS_COOKIE_MAX_BOOKS = 20;
export const PROGRESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** Maior valor aceito ao ler (20 livros de slug longo cabem com folga). */
const MAX_RAW_LENGTH = 4096;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 80;

export type ProgressMap = Record<string, number>;

export function isValidBookSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length <= SLUG_MAX && SLUG.test(slug);
}

/**
 * Lê o cookie. Texto malformado, que não seja um objeto, ou entradas com slug ou capítulo inválidos
 * são descartados: o que sobrar é o progresso confiável (no máximo 20 livros).
 */
export function parseProgressCookie(raw: string | undefined | null): ProgressMap {
  if (!raw || raw.length > MAX_RAW_LENGTH) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

  const out: ProgressMap = {};
  for (const [slug, chapter] of Object.entries(parsed)) {
    if (Object.keys(out).length >= PROGRESS_COOKIE_MAX_BOOKS) break;
    if (!isValidBookSlug(slug)) continue;
    if (typeof chapter !== 'number' || !Number.isInteger(chapter)) continue;
    if (chapter < 0 || chapter > PROGRESS_MAX) continue;
    out[slug] = chapter;
  }
  return out;
}

/**
 * Novo conteúdo do cookie com `slug` em `chapter`. O livro tocado vai para o fim (o mais recente);
 * passando de 20 livros, o mais antigo sai.
 */
export function withProgress(map: ProgressMap, slug: string, chapter: number): ProgressMap {
  const next: ProgressMap = {};
  for (const [key, value] of Object.entries(map)) if (key !== slug) next[key] = value;
  next[slug] = chapter;
  const keys = Object.keys(next);
  for (const key of keys.slice(0, Math.max(0, keys.length - PROGRESS_COOKIE_MAX_BOOKS))) {
    delete next[key];
  }
  return next;
}

/**
 * O progresso de um livro no mapa, ou `null`. Usa `hasOwn`: um slug como "constructor" é válido e
 * `map['constructor']` num objeto comum devolveria a função do protótipo.
 */
export function getProgress(map: ProgressMap, slug: string): number | null {
  return Object.hasOwn(map, slug) ? (map[slug] ?? null) : null;
}

export const serializeProgressCookie = (map: ProgressMap): string => JSON.stringify(map);

/** Opções do cookie. `Secure` só em produção: o Safari não aceita cookie `Secure` em http://localhost. */
export function progressCookieOptions(production: boolean) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: PROGRESS_COOKIE_MAX_AGE,
  };
}
