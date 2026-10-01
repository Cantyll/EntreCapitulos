'use server';

import { revalidatePath, updateTag } from 'next/cache';

import { finalizeCoverWith, type FinalizeCoverResult } from '@/lib/books/finalize-cover';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { invalidateBooks } from '@/lib/public/tags';
import { THEME_TAG } from '@/lib/theme/tag';

/**
 * Passo final do envio da capa. O navegador já mandou o arquivo para o Storage com a sessão da
 * admin; aqui o servidor confere, reencoda para WebP, extrai a paleta e grava no livro.
 */
export async function finalizeCover(
  bookId: string,
  objectPath: string,
): Promise<FinalizeCoverResult> {
  await requireRole('admin');

  const supabase = await createClient();
  const result = await finalizeCoverWith(supabase, bookId, objectPath);

  if (result.ok) {
    updateTag(THEME_TAG);
    invalidateBooks();
    revalidatePath('/', 'layout');
  }
  return result;
}
