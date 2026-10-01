import 'server-only';

import { cache } from 'react';

import { isMarginNoteVisible } from '@/lib/spoiler';
import { isValidBookSlug } from '@/lib/spoiler';

import {
  getMemberMarginNotes,
  getMemberSessionDetail,
  getMemberSessions,
  getProgressFor,
  getViewer,
} from './person';
import { getBooks, getPublicMarginNotes, getPublicSessionDetail, getPublicSessions } from './queries';
import type { MarginNote, PublicBook, SessionDetail, SessionSummary } from './types';

/*
 * Monta os dados de cada página pública. A regra de desempenho está aqui: o que é público vem do
 * cache compartilhado (`queries.ts`), o que é por pessoa vem do cliente com cookies (`person.ts`), e
 * tudo que não depende de outra resposta roda em paralelo (`Promise.all`).
 */

const newestFirst = (a: SessionSummary, b: SessionSummary) => b.number - a.number;

export type Viewer = Awaited<ReturnType<typeof getViewer>>;

/** O livro em leitura, do cache. Usado pelo cabeçalho e pela home. */
export async function getCurrentBook(): Promise<PublicBook | null> {
  const books = await getBooks();
  return books.find((book) => book.status === 'reading') ?? null;
}

export async function getBookBySlug(slug: string): Promise<PublicBook | null> {
  if (!isValidBookSlug(slug)) return null;
  const books = await getBooks();
  return books.find((book) => book.slug === slug) ?? null;
}

/**
 * As sessões de um livro que ESTA pessoa pode ler: as públicas (cache compartilhado) mais, se estiver
 * logada, as "só para membros" (cliente com cookies). Da mais nova para a mais antiga.
 */
export async function getVisibleSessions(bookId: string): Promise<SessionSummary[]> {
  const [publicSessions, memberSessions] = await Promise.all([
    getPublicSessions(),
    getMemberSessions(bookId),
  ]);
  return [...publicSessions.filter((s) => s.bookId === bookId), ...memberSessions].sort(newestFirst);
}

/** Quantas sessões públicas cada livro tem (a estante e as abas de /sessoes). */
export async function getPublicSessionCounts(): Promise<Map<string, number>> {
  const sessions = await getPublicSessions();
  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(s.bookId, (counts.get(s.bookId) ?? 0) + 1);
  return counts;
}

// --- Home ---------------------------------------------------------------------------------------

export type HomeData = {
  book: PublicBook | null;
  sessions: SessionSummary[];
  progress: number | null;
  viewer: Viewer;
  finished: PublicBook[];
};

async function loadHomeUncached(): Promise<HomeData> {
  const books = await getBooks();
  const book = books.find((b) => b.status === 'reading') ?? null;
  const finished = books.filter((b) => b.status === 'finished');
  if (!book) return { book, sessions: [], progress: null, viewer: await getViewer(), finished };

  const [sessions, progress, viewer] = await Promise.all([
    getVisibleSessions(book.id),
    getProgressFor(book),
    getViewer(),
  ]);
  return { book, sessions, progress, viewer, finished };
}

// --- Página do livro ------------------------------------------------------------------------------

export type BookPageData = {
  book: PublicBook;
  isCurrent: boolean;
  sessions: SessionSummary[];
  progress: number | null;
  viewer: Viewer;
  /** Anotações na margem já filtradas pelo progresso (vazio sem progresso). */
  marginNotes: MarginNote[];
};

export const MARGIN_NOTES_LIMIT = 4;

export function pickMarginNotes(
  notes: readonly MarginNote[],
  progress: number | null,
  limit = MARGIN_NOTES_LIMIT,
): MarginNote[] {
  if (progress === null) return [];
  return notes
    .filter((n) => isMarginNoteVisible(progress, n.chapterTo))
    .sort((a, b) => b.sessionNumber - a.sessionNumber)
    .slice(0, limit);
}

async function loadBookPageUncached(slug: string): Promise<BookPageData | null> {
  const book = await getBookBySlug(slug);
  if (!book) return null;

  const [sessions, progress, viewer, publicNotes, memberNotes] = await Promise.all([
    getVisibleSessions(book.id),
    getProgressFor(book),
    getViewer(),
    getPublicMarginNotes(book.id),
    getMemberMarginNotes(book.id),
  ]);
  return {
    book,
    isCurrent: book.status === 'reading',
    sessions,
    progress,
    viewer,
    marginNotes: pickMarginNotes([...publicNotes, ...memberNotes], progress),
  };
}

// --- Sessão -------------------------------------------------------------------------------------------

export type SessionPageData =
  | {
      kind: 'ok';
      book: PublicBook;
      session: SessionDetail;
      sessions: SessionSummary[];
      progress: number | null;
      viewer: Viewer;
    }
  /** Visitante deslogado e a sessão não está liberada (só membros OU inexistente: igual nos dois). */
  | { kind: 'login' }
  | { kind: 'not-found' };

async function loadSessionPageUncached(slug: string, number: number): Promise<SessionPageData> {
  const book = await getBookBySlug(slug);
  if (!book) return (await getViewer()) ? { kind: 'not-found' } : { kind: 'login' };

  const [sessions, progress, viewer] = await Promise.all([
    getVisibleSessions(book.id),
    getProgressFor(book),
    getViewer(),
  ]);

  const summary = sessions.find((s) => s.number === number);
  if (!summary) return viewer ? { kind: 'not-found' } : { kind: 'login' };

  // Pública: corpo do cache compartilhado. Só para membros: lido com a sessão de quem pede.
  const session = summary.membersOnly
    ? await getMemberSessionDetail(summary.id)
    : await getPublicSessionDetail(summary.id);
  if (!session) return viewer ? { kind: 'not-found' } : { kind: 'login' };

  return { kind: 'ok', book, session, sessions, progress, viewer };
}

// --- /sessoes e /estante ------------------------------------------------------------------------------

export type ShelfData = {
  finished: PublicBook[];
  queued: PublicBook[];
  counts: Map<string, number>;
};

async function loadShelfUncached(): Promise<ShelfData> {
  const [books, counts] = await Promise.all([getBooks(), getPublicSessionCounts()]);
  return {
    finished: books
      .filter((b) => b.status === 'finished')
      .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '')),
    queued: books.filter((b) => b.status === 'queued'),
    counts,
  };
}

/*
 * As páginas e o `generateMetadata` pedem os mesmos dados na mesma requisição: com `cache` do React o
 * segundo pedido reaproveita o primeiro, sem nenhuma consulta a mais.
 */
export const loadHome = cache(loadHomeUncached);
export const loadBookPage = cache(loadBookPageUncached);
export const loadSessionPage = cache(loadSessionPageUncached);
export const loadShelf = cache(loadShelfUncached);
