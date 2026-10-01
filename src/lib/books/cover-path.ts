/*
 * Caminhos dos objetos do bucket `covers`. O navegador manda o caminho para a Server Action, então
 * tudo aqui é validação de entrada não confiável: só `books/<uuid>/<nome seguro>` com o mesmo
 * uuid do livro passa. Nada de `..`, barras extras, outro bucket ou outro livro.
 */
export const COVER_BUCKET = 'covers';
export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

export const coverFolder = (bookId: string): string => `books/${bookId}`;

export type CoverPathResult = { ok: true; folder: string; name: string } | { ok: false };

/** Confere `books/<uuid>/<nome>` e que o uuid do caminho é o do livro. */
export function parseCoverPath(bookId: unknown, objectPath: unknown): CoverPathResult {
  if (!isUuid(bookId) || typeof objectPath !== 'string') return { ok: false };
  const parts = objectPath.split('/');
  if (parts.length !== 3) return { ok: false };
  const [root, id, name] = parts as [string, string, string];
  if (root !== 'books' || id !== bookId) return { ok: false };
  if (!SAFE_NAME.test(name) || name.includes('..')) return { ok: false };
  return { ok: true, folder: coverFolder(bookId), name };
}

/** Extensão de arquivo segura para o nome do upload, a partir do tipo declarado. */
export function extensionFor(mime: string): 'png' | 'jpg' | 'webp' | null {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return null;
}

/**
 * URL pública de uma capa, ou `null` se a URL do Supabase não estiver configurada ou for
 * inválida (a interface então usa a capa gerada por CSS). Só lê a variável; nunca lança.
 */
export function coverUrl(coverPath: string | null | undefined): string | null {
  if (!coverPath || !/^books\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(coverPath)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.origin}/storage/v1/object/public/${COVER_BUCKET}/${coverPath}`;
  } catch {
    return null;
  }
}
