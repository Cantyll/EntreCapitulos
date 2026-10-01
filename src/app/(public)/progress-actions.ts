'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { logFailure } from '@/lib/auth/log';
import { getBookBySlug } from '@/lib/public/loaders';
import { getCookieProgress, getViewer } from '@/lib/public/person';
import { createClient } from '@/lib/supabase/server';
import {
  PROGRESS_COOKIE,
  isValidBookSlug,
  parseProgress,
  progressCookieOptions,
  serializeProgressCookie,
  withProgress,
} from '@/lib/spoiler';

export type ProgressResult = { ok: true } | { ok: false; message: string };

const FAIL = 'Não foi possível guardar agora. Tente de novo em instantes.';

/**
 * "Li até o capítulo X" de um livro. O capítulo é um inteiro de 0 a `total_chapters`. Logada: grava
 * em `reading_progress` (RLS: só a própria linha). Visitante: grava no cookie `ec_progress` (httpOnly).
 * Não exige papel nenhum: é dado da própria pessoa.
 */
export async function setReadingProgress(
  bookSlug: string,
  chapter: number,
): Promise<ProgressResult> {
  if (!isValidBookSlug(bookSlug)) return { ok: false, message: 'Livro não encontrado.' };

  try {
    const book = await getBookBySlug(bookSlug);
    if (!book) return { ok: false, message: 'Livro não encontrado.' };

    const valid = parseProgress(chapter, book.totalChapters);
    if (valid === null) {
      return { ok: false, message: `Escolha um capítulo de 0 a ${book.totalChapters}.` };
    }

    const viewer = await getViewer();
    if (viewer) {
      const supabase = await createClient();
      const { error } = await supabase
        .from('reading_progress')
        .upsert(
          { user_id: viewer.id, book_id: book.id, chapter: valid },
          { onConflict: 'user_id,book_id' },
        );
      if (error) throw error;
    } else {
      const store = await cookies();
      const next = withProgress(await getCookieProgress(), book.slug, valid);
      store.set(
        PROGRESS_COOKIE,
        serializeProgressCookie(next),
        progressCookieOptions(process.env.NODE_ENV === 'production'),
      );
    }

    // O progresso muda o que está coberto em várias páginas: o layout público inteiro é refeito.
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    logFailure('progress.set', error);
    return { ok: false, message: FAIL };
  }
}
