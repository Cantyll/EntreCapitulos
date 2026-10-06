'use client';

import { finalizeAboutPhoto } from '@/app/painel/sobre/actions';
import { sitePhotoUploadPath } from '@/lib/about';
import {
  COVER_BUCKET,
  COVER_MAX_BYTES,
  COVER_MIME_TYPES,
  extensionFor,
} from '@/lib/books/cover-path';
import { createClient } from '@/lib/supabase/browser';

/** Confere tipo e tamanho antes de enviar (o servidor confere o formato REAL e as dimensões depois). */
export function validatePhotoFile(file: File): string | null {
  if (!(COVER_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Envie uma imagem PNG, JPG ou WEBP.';
  }
  if (file.size > COVER_MAX_BYTES) return 'A foto passa de 5 MB. Escolha um arquivo menor.';
  if (file.size === 0) return 'Esse arquivo está vazio.';
  return null;
}

export type UploadPhotoResult = { ok: true; path: string } | { ok: false; message: string };

/**
 * O navegador envia o arquivo direto ao Storage (o corpo de uma requisição da Vercel é menor que o limite do bucket)
 * com a sessão da administração, para `site/sobre/incoming/`; depois a Server Action `finalizeAboutPhoto` confere o
 * formato real, recorta, tira os metadados, grava a foto pronta e apaga o original. Devolve o caminho da foto pronta.
 */
export async function uploadAboutPhoto(file: File): Promise<UploadPhotoResult> {
  const invalid = validatePhotoFile(file);
  if (invalid) return { ok: false, message: invalid };
  const ext = extensionFor(file.type);
  const path = ext ? sitePhotoUploadPath(crypto.randomUUID(), ext) : null;
  if (!path) return { ok: false, message: 'Envie uma imagem PNG, JPG ou WEBP.' };

  const bucket = createClient().storage.from(COVER_BUCKET);
  try {
    const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { ok: false, message: 'Não foi possível enviar a foto. Tente de novo.' };
  } catch {
    return {
      ok: false,
      message: 'Não foi possível enviar a foto. Confira a conexão e tente de novo.',
    };
  }

  try {
    const result = await finalizeAboutPhoto(path);
    return result.ok ? { ok: true, path: result.path } : { ok: false, message: result.error };
  } catch {
    // A chamada ao servidor falhou: tenta apagar o original enviado (o servidor limparia o resto).
    await bucket.remove([path]).catch(() => undefined);
    return {
      ok: false,
      message: 'Não foi possível salvar a foto agora. Tente de novo em instantes.',
    };
  }
}
