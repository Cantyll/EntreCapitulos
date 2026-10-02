import 'server-only';

import { connection } from 'next/server';
import { cache } from 'react';

import { isValidBookSlug } from '@/lib/spoiler';
import { pickMarginNotes } from '@/lib/spoiler/margin';

import {
  getMemberMarginNotes,
  getMemberSessionDetail,
  getMemberSessions,
  getProgressFor,
  getViewer,
} from './person';
import {
  getBooks,
  getPublicCommentCounts,
  getPublicMarginNotes,
  getPublicSessionDetail,
  getPublicSessions,
} from './queries';
import type { MarginNote, PublicBook, SessionDetail, SessionSummary } from './types';

/*
 * Monta os dados de cada página pública. A regra de desempenho está aqui: o que é público vem do
 * cache compartilhado (`queries.ts`), o que é por pessoa vem do cliente com cookies (`person.ts`), e
 * tudo que não depende de outra resposta roda em paralelo (`Promise.all`).
 */

const newestFirst = (a: SessionSummary, b: SessionSummary) => b.number - a.number;

/*
 * `await connection()`: as páginas públicas são renderizadas a cada pedido (o dado vem do cache de dados,
 * não do HTML). Sem isso o build tentaria pré-renderizá-las e falharia sem as variáveis do Supabase.
 */
export type Viewer = Awaited<ReturnType<typeof getViewer>>;

/** O livro em leitura, do cache. Usado pelo cabeçalho e pela home. */
export async function getCurrentBook(): Promise<PublicBook | null> {
  await connection();
  const books = await getBooks();
  return books.find((book) => book.status === 'reading') ?? null;
}

export async function getBookBySlug(slug: string): Promise<PublicBook | null> {
  await connection();
  if (!isValidBookSlug(slug)) return null;
  const books = await getBooks();
  return books.find((book) => book.slug === slug) ?? null;
}

/**
 * As sessões de um livro que ESTA pessoa pode ler: as públicas (cache compartilhado) mais, se estiver
 * logada, as "só para membros" (cliente com cookies). Da mais nova para a mais antiga.
 */
export async function getVisibleSessions(bookId: string): Promise<SessionSummary[]> {
  await connection();
  const [publicSessions, counts, memberSessions] = await Promise.all([
    getPublicSessions(),
    getPublicCommentCounts(),
    getMemberSessions(bookId),
  ]);
  const withCounts = publicSessions
    .filter((s) => s.bookId === bookId)
    .map((s) => ({ ...s, commentCount: counts[s.id] ?? 0 }));
  return [...withCounts, ...memberSessions].sort(newestFirst);
}

/**
 * Quantas sessões públicas e quantos comentários aprovados (nelas) cada livro tem: a estante e as abas
 * de /sessoes. Tudo do cache compartilhado, nenhuma consulta quando está quente.
 */
export async function getPublicBookTotals(): Promise<{
  sessions: Map<string, number>;
  comments: Map<string, number>;
}> {
  await connection();
  const [sessions, commentCounts] = await Promise.all([getPublicSessions(), getPublicCommentCounts()]);
  const sessionTotals = new Map<string, number>();
  const commentTotals = new Map<string, number>();
  for (const s of sessions) {
    sessionTotals.set(s.bookId, (sessionTotals.get(s.bookId) ?? 0) + 1);
    commentTotals.set(s.bookId, (commentTotals.get(s.bookId) ?? 0) + (commentCounts[s.id] ?? 0));
  }
  return { sessions: sessionTotals, comments: commentTotals };
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
  await connection();
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

async function loadBookPageUncached(slug: string): Promise<BookPageData | null> {
  await connection();
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
  await connection();
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
  /** Comentários aprovados por livro (só sessões públicas). */
  commentCounts: Map<string, number>;
};

async function loadShelfUncached(): Promise<ShelfData> {
  await connection();
  const [books, totals] = await Promise.all([getBooks(), getPublicBookTotals()]);
  return {
    finished: books
      .filter((b) => b.status === 'finished')
      .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '')),
    queued: books.filter((b) => b.status === 'queued'),
    counts: totals.sessions,
    commentCounts: totals.comments,
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
