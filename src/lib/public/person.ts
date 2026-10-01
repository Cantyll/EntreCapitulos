import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

import { getCurrentUserOrNull } from '@/lib/auth/current-user';
import { createClient } from '@/lib/supabase/server';
import {
  PROGRESS_COOKIE,
  getProgress,
  parseProgress,
  parseProgressCookie,
  type ProgressMap,
} from '@/lib/spoiler';

import {
  SESSION_DETAIL_COLUMNS,
  SESSION_LIST_COLUMNS,
  toSessionDetail,
  toSessionSummary,
} from './mappers';
import type { MarginNote, SessionDetail, SessionSummary } from './types';

/*
 * Leituras POR PESSOA: usam o cliente COM cookies (a sessão de quem pede) e NUNCA entram em cache
 * compartilhado. É aqui que vivem o progresso de leitura e as sessões "só para membros": o RLS do
 * banco decide o que cada pessoa enxerga, e dois visitantes diferentes jamais dividem esse resultado.
 */

/** Quem está logado (ou `null`). Compartilha a memoização por requisição do cabeçalho. */
export const getViewer = cache(async () => getCurrentUserOrNull('página pública'));

/** O cookie de progresso do visitante, já validado. Uma leitura por requisição. */
export const getCookieProgress = cache(async (): Promise<ProgressMap> => {
  const store = await cookies();
  return parseProgressCookie(store.get(PROGRESS_COOKIE)?.value);
});

/**
 * Até que capítulo a pessoa leu DESTE livro, ou `null` quando não se sabe (nem banco nem cookie).
 * Logada: a linha de `reading_progress` (RLS: só a própria); sem linha, cai no cookie (o valor de
 * antes do login, ainda não migrado). Visitante: só o cookie, sem nenhuma consulta.
 */
export async function getProgressFor(book: {
  id: string;
  slug: string;
  totalChapters: number;
}): Promise<number | null> {
  const [viewer, cookieMap] = await Promise.all([getViewer(), getCookieProgress()]);
  const fromCookie = parseProgress(getProgress(cookieMap, book.slug), book.totalChapters);

  if (!viewer) return fromCookie;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reading_progress')
    .select('chapter')
    .eq('user_id', viewer.id)
    .eq('book_id', book.id)
    .maybeSingle();
  if (error) throw error;
  if (data) return parseProgress(data.chapter, book.totalChapters) ?? 0;
  return fromCookie;
}

/** Sessões publicadas "só para membros" de um livro, para quem está logado. Visitante: lista vazia. */
export async function getMemberSessions(bookId: string): Promise<SessionSummary[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reading_sessions')
    .select(SESSION_LIST_COLUMNS)
    .eq('book_id', bookId)
    .eq('status', 'published')
    .eq('visibility', 'members')
    .order('number', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toSessionSummary);
}

/** O corpo de uma sessão "só para membros", lido com a sessão de quem pede (sem cache). */
export async function getMemberSessionDetail(id: string): Promise<SessionDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reading_sessions')
    .select(SESSION_DETAIL_COLUMNS)
    .eq('id', id)
    .eq('status', 'published')
    .eq('visibility', 'members')
    .maybeSingle();
  if (error) throw error;
  return data ? toSessionDetail(data) : null;
}

/** Notas das sessões "só para membros" de um livro, para quem está logado. */
export async function getMemberMarginNotes(bookId: string): Promise<MarginNote[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('session_notes')
    .select(
      'id, kind, text, reference, position, reading_sessions!inner(number, chapter_to, published_at, book_id, status, visibility)',
    )
    .eq('reading_sessions.book_id', bookId)
    .eq('reading_sessions.status', 'published')
    .eq('reading_sessions.visibility', 'members')
    .order('position')
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const session = row.reading_sessions as unknown as {
      number: number;
      chapter_to: number;
      published_at: string | null;
    };
    return {
      id: row.id,
      kind: row.kind === 'quote' ? ('quote' as const) : ('note' as const),
      text: row.text,
      reference: row.reference,
      sessionNumber: session.number,
      chapterTo: session.chapter_to,
      publishedAt: session.published_at,
    };
  });
}
