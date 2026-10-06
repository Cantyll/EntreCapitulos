import 'server-only';

import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logFailure } from '@/lib/auth/log';
import { CoverError, type CoverErrorCode } from '@/lib/books/cover-image';
import { COVER_BUCKET, COVER_MAX_BYTES } from '@/lib/books/cover-path';
import type { Database } from '@/lib/supabase/database.types';

import { processAboutPhoto } from './photo-image';
import { SITE_PHOTO_FOLDER, isSiteUploadPath } from './urls';

/*
 * Núcleo do `finalizeAboutPhoto`: recebe o cliente já autenticado como administração (o RLS do bucket é quem de fato
 * autoriza) e o caminho que o navegador enviou. Confere o caminho, baixa o arquivo, processa (formato real,
 * dimensões, EXIF, recorte 512x512, WebP sem metadados), grava com um NOME NOVO e só então apaga o original. Não grava
 * nada no banco: a foto entra no conteúdo da página quando a pessoa salva o rascunho. A foto anterior NÃO é apagada
 * aqui (o publicado e o histórico ainda podem usá-la): quem decide é a varredura (`photo-gc.ts`). Em qualquer falha, o
 * original e o arquivo novo são apagados na hora (nenhuma sobra com metadados no bucket público).
 */

export const PHOTO_MESSAGES = {
  invalid_upload: 'Envio inválido. Escolha a foto de novo.',
  file_too_big: 'A foto passa de 5 MB. Escolha um arquivo menor.',
  invalid_format: 'O arquivo não é uma imagem PNG, JPG ou WEBP válida.',
  too_small: 'A foto é pequena demais. Use pelo menos 200 px de largura e de altura.',
  too_large: 'A foto é grande demais. Use no máximo 6000 px de largura e de altura.',
  unreadable: 'Não foi possível ler essa foto. Tente outro arquivo.',
  engine: 'Não conseguimos processar imagens agora. Tente de novo em instantes.',
  save_failed: 'Não foi possível salvar a foto agora. Tente de novo em instantes.',
} as const satisfies Record<CoverErrorCode | string, string>;

export type PhotoMessageKey = keyof typeof PHOTO_MESSAGES;

export type FinalizePhotoResult = { ok: true; path: string } | { ok: false; error: string };

type Client = Pick<SupabaseClient<Database>, 'storage'>;

const fail = (key: PhotoMessageKey): FinalizePhotoResult => ({
  ok: false,
  error: PHOTO_MESSAGES[key],
});

export async function finalizeAboutPhotoWith(
  supabase: Client,
  objectPath: unknown,
): Promise<FinalizePhotoResult> {
  // Caminho que não segue site/sobre/incoming/<uuid>.<ext>: não toca em nada do Storage.
  if (!isSiteUploadPath(objectPath)) return fail('invalid_upload');
  const original = objectPath;
  const bucket = supabase.storage.from(COVER_BUCKET);

  const removeQuietly = async (paths: string[]) => {
    if (paths.length === 0) return;
    try {
      const { error } = await bucket.remove(paths);
      if (error) logFailure('about.photo.remove', error);
    } catch (error) {
      logFailure('about.photo.remove', error);
    }
  };

  let newPath: string | null = null;
  try {
    const { data: blob, error: downloadError } = await bucket.download(original);
    if (downloadError || !blob) throw downloadError ?? new Error('download_empty');
    if (blob.size > COVER_MAX_BYTES) {
      await removeQuietly([original]);
      return fail('file_too_big');
    }

    const webp = await processAboutPhoto(Buffer.from(await blob.arrayBuffer()));

    newPath = `${SITE_PHOTO_FOLDER}/${randomUUID()}.webp`;
    const { error: uploadError } = await bucket.upload(newPath, webp, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });
    if (uploadError) {
      newPath = null; // nada foi gravado
      throw uploadError;
    }
  } catch (error) {
    // Falhou: apaga o original (com os metadados) e, se chegou a existir, o arquivo novo.
    await removeQuietly([original, ...(newPath ? [newPath] : [])]);
    if (error instanceof CoverError) return fail(error.code);
    logFailure('about.photo.finalize', error);
    return fail('save_failed');
  }

  // Deu certo: o original (com EXIF) não precisa mais existir.
  await removeQuietly([original]);
  return { ok: true, path: newPath };
}
