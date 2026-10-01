'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireRole } from '@/lib/auth/session';
import { logFailure } from '@/lib/auth/log';
import { type BookActionState } from '@/lib/books/action-state';
import { COVER_BUCKET, coverFolder, isUuid } from '@/lib/books/cover-path';
import { BOOK_MESSAGES, bookErrorMessage } from '@/lib/books/errors';
import { slugify, uniqueSlug } from '@/lib/books/slug';
import {
  bookFieldsSchema,
  checkChapters,
  createBookSchema,
  currentChapterSchema,
  fieldErrors,
  numberField,
  parseGenres,
  ratingSchema,
  totalChaptersSchema,
} from '@/lib/books/validation';
import { createClient } from '@/lib/supabase/server';
import { invalidateBooks } from '@/lib/public/tags';
import { THEME_TAG } from '@/lib/theme/tag';

/*
 * Todas as ações de livros exigem `requireRole('admin')` logo no começo (o RLS do banco confere de
 * novo). Falhas inesperadas passam por `logFailure` (só nome, status, code e cause.code) e a pessoa
 * vê uma mensagem em pt-BR. Depois de qualquer mudança, o cache do tema e o do layout são
 * invalidados: o tema pode ter mudado e o cache do navegador não pode servir o livro antigo.
 */

const ok = (message: string, extra: Partial<BookActionState> = {}): BookActionState => ({
  status: 'ok',
  message,
  ...extra,
});
const error = (message: string, errors?: Record<string, string>): BookActionState => ({
  status: 'error',
  message,
  errors,
});
const generic = () => error(BOOK_MESSAGES.generic);

function refreshAfterBookChange() {
  updateTag(THEME_TAG);
  invalidateBooks();
  revalidatePath('/', 'layout');
}

const str = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
};

export async function createBook(
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  await requireRole('admin');

  const status = str(formData, 'status');
  const ratingRaw = numberField(formData.get('rating'));
  const parsed = createBookSchema.safeParse({
    title: str(formData, 'title'),
    author: str(formData, 'author'),
    synopsis: str(formData, 'synopsis'),
    genres: parseGenres(str(formData, 'genres')),
    total_chapters: numberField(formData.get('total_chapters')),
    status,
    rating: status === 'finished' && !Number.isNaN(ratingRaw) ? ratingRaw : null,
    finished_at: status === 'finished' ? str(formData, 'finished_at') || null : null,
  });
  if (!parsed.success) return error('Confira os campos destacados.', fieldErrors(parsed.error));
  const input = parsed.data;

  try {
    const supabase = await createClient();
    const base = slugify(input.title);

    let id: string | null = null;
    // O slug é único: se alguém criar o mesmo título ao mesmo tempo, tenta de novo com o próximo.
    for (let attempt = 0; attempt < 3 && !id; attempt++) {
      const { data: taken, error: takenError } = await supabase
        .from('books')
        .select('slug')
        .like('slug', `${base}%`);
      if (takenError) throw takenError;
      const slug = uniqueSlug(base, new Set((taken ?? []).map((row) => row.slug)));

      const finished = input.status === 'finished';
      const { data, error: insertError } = await supabase
        .from('books')
        .insert({
          slug,
          title: input.title,
          author: input.author,
          synopsis: input.synopsis,
          genres: input.genres,
          total_chapters: input.total_chapters,
          status: finished ? 'finished' : 'queued',
          current_chapter: finished ? input.total_chapters : 0,
          rating: finished ? input.rating : null,
          finished_at: finished ? input.finished_at : null,
        })
        .select('id')
        .single();
      if (insertError) {
        if (insertError.code === '23505' && attempt < 2) continue;
        logFailure('books.create', insertError);
        return error(bookErrorMessage(insertError));
      }
      id = data.id;
    }
    if (!id) return generic();

    if (input.status === 'reading') {
      const { error: startError } = await supabase.rpc('start_book', { p_book_id: id });
      if (startError) {
        logFailure('books.start (ao criar)', startError);
        refreshAfterBookChange();
        return ok(`Livro criado na fila. ${bookErrorMessage(startError)}`, { bookId: id });
      }
    }

    refreshAfterBookChange();
    return ok('Livro criado.', { bookId: id });
  } catch (caught) {
    logFailure('books.create', caught);
    return generic();
  }
}

export async function updateBook(
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  await requireRole('admin');

  const id = str(formData, 'bookId');
  if (!isUuid(id)) return error(BOOK_MESSAGES.book_not_found);

  const parsed = bookFieldsSchema.safeParse({
    title: str(formData, 'title'),
    author: str(formData, 'author'),
    synopsis: str(formData, 'synopsis'),
    genres: parseGenres(str(formData, 'genres')),
    total_chapters: numberField(formData.get('total_chapters')),
  });
  if (!parsed.success) return error('Confira os campos destacados.', fieldErrors(parsed.error));
  const input = parsed.data;

  try {
    const supabase = await createClient();
    const { data: book, error: readError } = await supabase
      .from('books')
      .select('current_chapter')
      .eq('id', id)
      .maybeSingle();
    if (readError) throw readError;
    if (!book) return error(BOOK_MESSAGES.book_not_found);

    const chapters = checkChapters(book.current_chapter, input.total_chapters);
    if (chapters) return error('Confira os campos destacados.', { total_chapters: chapters });

    // O slug não muda: a URL pública do livro continua a mesma.
    const { error: updateError } = await supabase
      .from('books')
      .update({
        title: input.title,
        author: input.author,
        synopsis: input.synopsis,
        genres: input.genres,
        total_chapters: input.total_chapters,
      })
      .eq('id', id);
    if (updateError) {
      logFailure('books.update', updateError);
      return error(bookErrorMessage(updateError));
    }
    refreshAfterBookChange();
    return ok('Livro salvo.', { bookId: id });
  } catch (caught) {
    logFailure('books.update', caught);
    return generic();
  }
}

export async function updateProgress(
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  await requireRole('admin');

  const id = str(formData, 'bookId');
  if (!isUuid(id)) return error(BOOK_MESSAGES.book_not_found);

  const current = currentChapterSchema.safeParse(numberField(formData.get('current_chapter')));
  const total = totalChaptersSchema.safeParse(numberField(formData.get('total_chapters')));
  const errors: Record<string, string> = {};
  if (!current.success) errors.current_chapter = current.error.issues[0]!.message;
  if (!total.success) errors.total_chapters = total.error.issues[0]!.message;
  if (current.success && total.success) {
    const chapters = checkChapters(current.data, total.data);
    if (chapters) errors.total_chapters = chapters;
  }
  if (Object.keys(errors).length > 0 || !current.success || !total.success) {
    return error('Confira os capítulos.', errors);
  }

  try {
    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from('books')
      .update({ current_chapter: current.data, total_chapters: total.data })
      .eq('id', id);
    if (updateError) {
      logFailure('books.progress', updateError);
      return error(bookErrorMessage(updateError));
    }
    refreshAfterBookChange();
    return ok('Progresso salvo.');
  } catch (caught) {
    logFailure('books.progress', caught);
    return generic();
  }
}

export async function startBook(
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  await requireRole('admin');

  const id = str(formData, 'bookId');
  if (!isUuid(id)) return error(BOOK_MESSAGES.book_not_found);

  try {
    const supabase = await createClient();
    const { error: startError } = await supabase.rpc('start_book', { p_book_id: id });
    if (startError) {
      logFailure('books.start', startError);
      return error(bookErrorMessage(startError));
    }
    refreshAfterBookChange();
    return ok('Leitura começou.');
  } catch (caught) {
    logFailure('books.start', caught);
    return generic();
  }
}

export async function finishBook(
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  await requireRole('admin');

  const id = str(formData, 'bookId');
  if (!isUuid(id)) return error(BOOK_MESSAGES.book_not_found);

  const rating = ratingSchema.safeParse(numberField(formData.get('rating')));
  if (!rating.success)
    return error('Escolha a nota do livro.', { rating: rating.error.issues[0]!.message });

  try {
    const supabase = await createClient();
    const { error: finishError } = await supabase.rpc('finish_book', {
      p_book_id: id,
      p_rating: rating.data,
    });
    if (finishError) {
      logFailure('books.finish', finishError);
      return error(bookErrorMessage(finishError));
    }
    refreshAfterBookChange();
    return ok('Livro marcado como terminado.');
  } catch (caught) {
    logFailure('books.finish', caught);
    return generic();
  }
}

export async function setThemeAuto(
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  await requireRole('admin');

  const id = str(formData, 'bookId');
  if (!isUuid(id)) return error(BOOK_MESSAGES.book_not_found);
  const enabled = str(formData, 'enabled') === 'true';

  try {
    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from('books')
      .update({ theme_auto: enabled })
      .eq('id', id);
    if (updateError) {
      logFailure('books.themeAuto', updateError);
      return error(bookErrorMessage(updateError));
    }
    refreshAfterBookChange();
    return ok(enabled ? 'Tema automático ligado.' : 'Tema automático desligado.');
  } catch (caught) {
    logFailure('books.themeAuto', caught);
    return generic();
  }
}

export async function deleteBook(
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  await requireRole('admin');

  const id = str(formData, 'bookId');
  if (!isUuid(id)) return error(BOOK_MESSAGES.book_not_found);

  try {
    const supabase = await createClient();

    const { count, error: countError } = await supabase
      .from('reading_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('book_id', id);
    if (countError) throw countError;
    if ((count ?? 0) > 0) return error(BOOK_MESSAGES.has_sessions);

    // Primeiro a linha (o banco recusa se houver sessões); só depois a capa do Storage.
    const { error: deleteError } = await supabase.from('books').delete().eq('id', id);
    if (deleteError) {
      logFailure('books.delete', deleteError);
      return error(bookErrorMessage(deleteError));
    }

    try {
      const bucket = supabase.storage.from(COVER_BUCKET);
      const folder = coverFolder(id);
      const { data: files, error: listError } = await bucket.list(folder, { limit: 1000 });
      if (listError) throw listError;
      const paths = (files ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`);
      if (paths.length > 0) {
        const { error: removeError } = await bucket.remove(paths);
        if (removeError) throw removeError;
      }
    } catch (storageError) {
      // O livro já foi excluído; sobra só arquivo órfão.
      logFailure('books.delete (capa)', storageError);
    }
  } catch (caught) {
    logFailure('books.delete', caught);
    return generic();
  }

  refreshAfterBookChange();
  redirect('/painel/livros');
}
