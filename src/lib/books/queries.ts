import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logFailure } from '@/lib/auth/log';
import { parsePalette, parseTokens, type StoredPalette, type ThemeTokens } from '@/lib/theme';
import type { Database } from '@/lib/supabase/database.types';

import { coverUrl } from './cover-path';

export type BookStatus = 'reading' | 'finished' | 'queued';

export type AdminBook = {
  id: string;
  slug: string;
  title: string;
  author: string;
  synopsis: string | null;
  genres: string[];
  totalChapters: number;
  currentChapter: number;
  status: BookStatus;
  rating: number | null;
  coverUrl: string | null;
  palette: StoredPalette | null;
  tokens: ThemeTokens | null;
  themeAuto: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  sessionCount: number;
  commentCount: number;
};

const toStatus = (value: string): BookStatus =>
  value === 'reading' || value === 'finished' ? value : 'queued';

/**
 * Livros para o painel (a leitura exige o papel admin só nas escritas; o RLS deixa todo mundo ler
 * livros, mas esta função só é chamada de páginas que usam `requireRole('admin')`). Traz também a
 * contagem de sessões e de comentários aprovados. Falha na contagem não derruba a página: cai em 0.
 */
export async function getAdminBooks(supabase: SupabaseClient<Database>): Promise<AdminBook[]> {
  const { data, error } = await supabase
    .from('books')
    .select('*, reading_sessions(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const comments = new Map<string, number>();
  try {
    const { data: rows, error: commentsError } = await supabase
      .from('reading_sessions')
      .select('book_id, comments(count)')
      .eq('comments.status', 'approved');
    if (commentsError) throw commentsError;
    for (const row of rows ?? []) {
      const count = (row.comments as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
      comments.set(row.book_id, (comments.get(row.book_id) ?? 0) + count);
    }
  } catch (countError) {
    logFailure('books: contagem de comentários', countError);
  }

  const books = (data ?? []).map((row): AdminBook => {
    const sessionCount =
      (row.reading_sessions as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      author: row.author,
      synopsis: row.synopsis,
      genres: row.genres,
      totalChapters: row.total_chapters,
      currentChapter: row.current_chapter,
      status: toStatus(row.status),
      rating: row.rating,
      coverUrl: coverUrl(row.cover_path),
      palette: parsePalette(row.palette),
      tokens: parseTokens(row.theme_tokens),
      themeAuto: row.theme_auto,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      sessionCount,
      commentCount: comments.get(row.id) ?? 0,
    };
  });

  // Em leitura primeiro; depois a fila; depois os terminados (a ordem de criação se mantém dentro de cada grupo).
  const rank: Record<BookStatus, number> = { reading: 0, queued: 1, finished: 2 };
  return books.sort((a, b) => rank[a.status] - rank[b.status]);
}

export async function getAdminBook(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<AdminBook | null> {
  const all = await getAdminBooks(supabase);
  return all.find((book) => book.id === id) ?? null;
}
