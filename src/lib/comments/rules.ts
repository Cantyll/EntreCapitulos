/*
 * Regras de comentário, puras: faixa do spoiler, cobertura, ordem, cursor e paginação.
 */

import { PROGRESS_MAX } from '@/lib/spoiler';

export const COMMENTS_PAGE_SIZE = 20;
/** Respostas embutidas por comentário de nível superior (a página avisa quando passa disso). */
export const REPLIES_LIMIT = 100;

// --- Spoiler ---------------------------------------------------------------------------------------

export type SpoilerCheck = { ok: true; value: number | null } | { ok: false };

/**
 * `spoiler_up_to` de um comentário: nulo (sem spoiler) ou um inteiro de `chapter_to + 1` até o total do
 * livro. Aceita o texto do formulário ("", "12") ou número; qualquer outra coisa é recusada.
 */
export function parseSpoilerUpTo(
  raw: unknown,
  chapterTo: number,
  totalChapters: number,
): SpoilerCheck {
  if (raw === null || raw === undefined || raw === '' || raw === '0')
    return { ok: true, value: null };
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d{1,4}$/.test(raw)
        ? Number(raw)
        : NaN;
  if (!Number.isInteger(value)) return { ok: false };
  const max = Math.min(totalChapters, PROGRESS_MAX);
  if (value < chapterTo + 1 || value > max) return { ok: false };
  return { ok: true, value };
}

/** Os capítulos que o compositor oferece em "Fala de algo depois do capítulo X?" (pode ser vazio). */
export function spoilerChoices(chapterTo: number, totalChapters: number): number[] {
  const max = Math.min(totalChapters, PROGRESS_MAX);
  const out: number[] = [];
  for (let chapter = chapterTo + 1; chapter <= max; chapter++) out.push(chapter);
  return out;
}

/**
 * Comentário coberto: tem marca de spoiler maior que o progresso (desconhecido = `UNKNOWN_PROGRESS`,
 * já aplicado por quem chama). O autor nunca vê o próprio comentário coberto.
 */
export function isCommentCovered(input: {
  spoilerUpTo: number | null;
  progress: number;
  isAuthor: boolean;
}): boolean {
  if (input.isAuthor) return false;
  return input.spoilerUpTo !== null && input.spoilerUpTo > input.progress;
}

// --- Ordem e cursor ---------------------------------------------------------------------------------

export type CommentOrder = 'recentes' | 'antigos';

export function parseCommentOrder(raw: unknown): CommentOrder {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'antigos' ? 'antigos' : 'recentes';
}

/**
 * Cursor de "Carregar mais": o `(created_at, id)` do último comentário da página. O `created_at` é TEXTO
 * OPACO (o Postgres tem microssegundos, o `Date` do JavaScript não): vai e volta como veio, sem `Date`.
 */
export type CommentCursor = { createdAt: string; id: string };

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

export function parseCursor(raw: unknown): CommentCursor | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { createdAt, id } = raw as Record<string, unknown>;
  if (typeof createdAt !== 'string' || !TIMESTAMP.test(createdAt)) return null;
  if (!isUuid(id)) return null;
  return { createdAt, id };
}

/**
 * Compara dois `timestamptz` em texto sem passar por `Date`: o corpo até os segundos e a fração
 * completada com zeros. Vale para o mesmo deslocamento (o PostgREST responde em UTC); um deslocamento
 * diferente cai para o `Date` (precisão de milissegundo), só em último caso.
 */
export function compareTimestamps(a: string, b: string): number {
  const parse = (value: string) => {
    const match =
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(
        value,
      );
    if (!match) return null;
    const offset = match[3] === 'Z' || /^[+-]00(:?00)?$/.test(match[3]!) ? 'Z' : match[3]!;
    return { base: match[1]!, fraction: (match[2] ?? '').padEnd(6, '0'), offset };
  };
  const left = parse(a);
  const right = parse(b);
  if (left && right && left.offset === right.offset) {
    if (left.base !== right.base) return left.base < right.base ? -1 : 1;
    if (left.fraction !== right.fraction) return left.fraction < right.fraction ? -1 : 1;
    return 0;
  }
  const diff = new Date(a).getTime() - new Date(b).getTime();
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

/** Cursor do último item de uma página (ou `null` se não há mais páginas). */
export function nextCursor(
  items: readonly { createdAt: string; id: string }[],
  hasMore: boolean,
): CommentCursor | null {
  const last = items.at(-1);
  return hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;
}
