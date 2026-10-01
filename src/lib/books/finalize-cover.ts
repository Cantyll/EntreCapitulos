import 'server-only';

import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logFailure } from '@/lib/auth/log';
import type { Database, Json } from '@/lib/supabase/database.types';

import { COVER_BUCKET, COVER_MAX_BYTES, coverFolder, parseCoverPath } from './cover-path';
import { CoverError, processCover, type CoverErrorCode } from './cover-image';

/*
 * Núcleo do `finalizeCover`: recebe o cliente já autenticado como admin (o RLS do bucket e da
 * tabela é quem de fato autoriza) e o caminho que o navegador enviou. Ordem pensada para nunca
 * deixar o livro sem capa: a capa anterior e a varredura só são apagadas DEPOIS de o update do
 * livro dar certo; se ele falhar, só a capa nova e o original enviado são apagados.
 */

export const COVER_MESSAGES = {
  invalid_upload: 'Envio inválido. Escolha a imagem de novo.',
  book_not_found: 'Livro não encontrado.',
  file_too_big: 'A imagem passa de 5 MB. Escolha um arquivo menor.',
  invalid_format: 'O arquivo não é uma imagem PNG, JPG ou WEBP válida.',
  too_small: 'A imagem é pequena demais. Use pelo menos 200 px de largura e de altura.',
  too_large: 'A imagem é grande demais. Use no máximo 6000 px de largura e de altura.',
  unreadable: 'Não foi possível ler essa imagem. Tente outro arquivo.',
  engine: 'Não conseguimos processar imagens agora. Tente de novo em instantes.',
  save_failed: 'Não foi possível salvar a capa agora. Tente de novo em instantes.',
} as const satisfies Record<CoverErrorCode | string, string>;

export type CoverMessageKey = keyof typeof COVER_MESSAGES;

export type FinalizeCoverResult =
  { ok: true; theme: 'applied' | 'none' } | { ok: false; error: string };

type Client = Pick<SupabaseClient<Database>, 'from' | 'storage'>;

const fail = (key: CoverMessageKey): FinalizeCoverResult => ({
  ok: false,
  error: COVER_MESSAGES[key],
});

export async function finalizeCoverWith(
  supabase: Client,
  bookId: unknown,
  objectPath: unknown,
): Promise<FinalizeCoverResult> {
  // Caminho que não segue books/<uuid>/<nome> com o mesmo uuid: não toca em nada do Storage.
  const parsed = parseCoverPath(bookId, objectPath);
  if (!parsed.ok) return fail('invalid_upload');
  const id = bookId as string;
  const original = objectPath as string;
  const bucket = supabase.storage.from(COVER_BUCKET);

  const removeQuietly = async (paths: string[]) => {
    if (paths.length === 0) return;
    try {
      const { error } = await bucket.remove(paths);
      if (error) logFailure('covers.remove', error);
    } catch (error) {
      logFailure('covers.remove', error);
    }
  };

  let newPath: string | null = null;
  let previous: string | null = null;
  let theme: 'applied' | 'none' = 'none';

  try {
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id, cover_path')
      .eq('id', id)
      .maybeSingle();
    if (bookError) throw bookError;
    if (!book) {
      await removeQuietly([original]);
      return fail('book_not_found');
    }
    previous = book.cover_path;

    const { data: blob, error: downloadError } = await bucket.download(original);
    if (downloadError || !blob) throw downloadError ?? new Error('download_empty');
    if (blob.size > COVER_MAX_BYTES) {
      await removeQuietly([original]);
      return fail('file_too_big');
    }

    const processed = await processCover(Buffer.from(await blob.arrayBuffer()));

    newPath = `${coverFolder(id)}/${randomUUID()}.webp`;
    const { error: uploadError } = await bucket.upload(newPath, processed.webp, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });
    if (uploadError) {
      newPath = null; // nada foi gravado
      throw uploadError;
    }

    const { error: updateError } = await supabase
      .from('books')
      .update({
        cover_path: newPath,
        palette: (processed.palette as unknown as Json) ?? null,
        theme_tokens: (processed.tokens as unknown as Json) ?? null,
      })
      .eq('id', id);
    if (updateError) throw updateError;

    theme = processed.tokens ? 'applied' : 'none';
  } catch (error) {
    // Falhou antes de o livro apontar para a capa nova: apaga SÓ a capa nova e o original.
    // A capa anterior (previous) continua intacta e em uso.
    await removeQuietly([original, ...(newPath ? [newPath] : [])]);
    if (error instanceof CoverError) return fail(error.code);
    logFailure('covers.finalize', error);
    return fail('save_failed');
  }

  // O livro já aponta para a capa nova: agora é seguro limpar a anterior, o original e qualquer
  // sobra de envios abandonados em books/<id>/. Falha aqui não desfaz nada (só sobra arquivo).
  const stale = new Set<string>([original]);
  const folder = coverFolder(id);
  if (previous && parseCoverPath(id, previous).ok) stale.add(previous);
  try {
    const { data: files, error } = await bucket.list(folder, { limit: 1000 });
    if (error) throw error;
    for (const file of files ?? []) if (file.id) stale.add(`${folder}/${file.name}`);
  } catch (error) {
    logFailure('covers.list', error);
  }
  stale.delete(newPath!);
  await removeQuietly([...stale]);

  return { ok: true, theme };
}
