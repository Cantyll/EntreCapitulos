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

/**
 * Grava o progresso da pessoa logada: atualiza a linha e, se ainda não existe, cria. Não é um upsert de
 * propósito: o `ON CONFLICT DO UPDATE` do PostgREST também tenta atualizar `user_id` e `book_id`, e o
 * banco só deixa a pessoa alterar a coluna `chapter` (grant por coluna).
 */
async function saveProgressRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  bookId: string,
  chapter: number,
): Promise<void> {
  const update = () =>
    supabase
      .from('reading_progress')
      .update({ chapter })
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .select('chapter');

  const first = await update();
  if (first.error) throw first.error;
  if (first.data.length > 0) return;

  const { error } = await supabase
    .from('reading_progress')
    .insert({ user_id: userId, book_id: bookId, chapter });
  if (!error) return;
  // Duas abas criaram a linha ao mesmo tempo: a outra venceu, então agora é só atualizar.
  if (error.code !== '23505') throw error;
  const retry = await update();
  if (retry.error) throw retry.error;
}

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
      await saveProgressRow(await createClient(), viewer.id, book.id, valid);
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
