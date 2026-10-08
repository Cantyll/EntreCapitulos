'use client';

import { finalizeCover } from '@/app/painel/livros/cover-actions';
import {
  COVER_BUCKET,
  COVER_MAX_BYTES,
  COVER_MIME_TYPES,
  coverFolder,
  extensionFor,
} from '@/lib/books/cover-path';

/** Confere tipo e tamanho antes de enviar (o servidor confere o formato real depois). */
export function validateCoverFile(file: File): string | null {
  if (!(COVER_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Envie uma imagem PNG, JPG ou WEBP.';
  }
  if (file.size > COVER_MAX_BYTES) return 'A imagem passa de 5 MB. Escolha um arquivo menor.';
  if (file.size === 0) return 'Esse arquivo está vazio.';
  return null;
}

/**
 * O cliente do Supabase (uns 66 KB comprimidos, com o Realtime) só é baixado quando alguém envia uma capa: o
 * formulário do livro abre sem ele.
 */
async function coverBucket() {
  const { createClient } = await import('@/lib/supabase/browser');
  return createClient().storage.from(COVER_BUCKET);
}

export type UploadCoverResult =
  { ok: true; theme: 'applied' | 'none' } | { ok: false; message: string };

/**
 * O navegador envia o arquivo direto ao Storage (o corpo de uma requisição da Vercel é menor que o
 * limite do bucket) com a sessão da admin; depois a Server Action `finalizeCover` valida,
 * reencoda e grava no livro.
 */
export async function uploadCover(bookId: string, file: File): Promise<UploadCoverResult> {
  const invalid = validateCoverFile(file);
  if (invalid) return { ok: false, message: invalid };
  const ext = extensionFor(file.type);
  if (!ext) return { ok: false, message: 'Envie uma imagem PNG, JPG ou WEBP.' };

  const path = `${coverFolder(bookId)}/${crypto.randomUUID()}.${ext}`;
  let bucket: Awaited<ReturnType<typeof coverBucket>>;
  try {
    bucket = await coverBucket();
    const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { ok: false, message: 'Não foi possível enviar a imagem. Tente de novo.' };
  } catch {
    return {
      ok: false,
      message: 'Não foi possível enviar a imagem. Confira a conexão e tente de novo.',
    };
  }

  try {
    const result = await finalizeCover(bookId, path);
    return result.ok ? { ok: true, theme: result.theme } : { ok: false, message: result.error };
  } catch {
    // A chamada ao servidor falhou: tenta limpar o original enviado (o servidor limparia o resto).
    await bucket.remove([path]).catch(() => undefined);
    return {
      ok: false,
      message: 'Não foi possível salvar a capa agora. Tente de novo em instantes.',
    };
  }
}
