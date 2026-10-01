import 'server-only';

import { unstable_cache } from 'next/cache';

import { createPublicClient } from './client';
import {
  BOOK_COLUMNS,
  SESSION_DETAIL_COLUMNS,
  SESSION_LIST_COLUMNS,
  toPublicBook,
  toSessionDetail,
  toSessionSummary,
} from './mappers';
import { BOOKS_TAG, SESSIONS_TAG, sessionTag } from './tags';
import type { MarginNote, PublicBook, SessionDetail, SessionSummary } from './types';

/*
 * Leituras PÚBLICAS, as que valem para qualquer visitante: livros e sessões publicadas e públicas.
 * Cada função usa o cliente sem cookies e vai para o cache de dados do Next com tags (`books`,
 * `sessions`, `session:<id>`), que as Server Actions expiram com `updateTag`. Um prazo de 5 minutos
 * é só rede de segurança. Quem lê é o RLS: o cliente anônimo nunca vê rascunho nem sessão só para
 * membros. Dado por pessoa (progresso, sessões só para membros) NÃO passa por aqui: ver `person.ts`.
 *
 * Erros do banco são lançados (o `unstable_cache` não guarda exceção) e a página decide o que mostrar.
 */

const SAFETY_NET_SECONDS = 300;

/** Todos os livros, sem `body`/paleta. Poucas linhas: as páginas filtram em memória. */
export const getBooks = unstable_cache(
  async (): Promise<PublicBook[]> => {
    const { data, error } = await createPublicClient()
      .from('books')
      .select(BOOK_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toPublicBook);
  },
  ['public:books'],
  { tags: [BOOKS_TAG], revalidate: SAFETY_NET_SECONDS },
);

/** Sessões publicadas e públicas de TODOS os livros (colunas de lista, sem `body`), da mais nova. */
export const getPublicSessions = unstable_cache(
  async (): Promise<SessionSummary[]> => {
    const { data, error } = await createPublicClient()
      .from('reading_sessions')
      .select(SESSION_LIST_COLUMNS)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .order('number', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toSessionSummary);
  },
  ['public:sessions'],
  { tags: [SESSIONS_TAG], revalidate: SAFETY_NET_SECONDS },
);

/** Corpo, trechos e perguntas de UMA sessão pública. `null` se ela não existe para o visitante. */
export function getPublicSessionDetail(id: string): Promise<SessionDetail | null> {
  return unstable_cache(
    async (sessionId: string): Promise<SessionDetail | null> => {
      const { data, error } = await createPublicClient()
        .from('reading_sessions')
        .select(SESSION_DETAIL_COLUMNS)
        .eq('id', sessionId)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .maybeSingle();
      if (error) throw error;
      return data ? toSessionDetail(data) : null;
    },
    ['public:session', id],
    { tags: [sessionTag(id), SESSIONS_TAG], revalidate: SAFETY_NET_SECONDS },
  )(id);
}

/** Notas (não as perguntas) das sessões públicas de um livro, para "Anotações na margem". */
export function getPublicMarginNotes(bookId: string): Promise<MarginNote[]> {
  return unstable_cache(
    async (id: string): Promise<MarginNote[]> => {
      const { data, error } = await createPublicClient()
        .from('session_notes')
        .select(
          'id, kind, text, reference, position, reading_sessions!inner(number, chapter_to, published_at, book_id, status, visibility)',
        )
        .eq('reading_sessions.book_id', id)
        .eq('reading_sessions.status', 'published')
        .eq('reading_sessions.visibility', 'public')
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
          kind: row.kind === 'quote' ? 'quote' : 'note',
          text: row.text,
          reference: row.reference,
          sessionNumber: session.number,
          chapterTo: session.chapter_to,
          publishedAt: session.published_at,
        } satisfies MarginNote;
      });
    },
    ['public:margin-notes', bookId],
    { tags: [SESSIONS_TAG], revalidate: SAFETY_NET_SECONDS },
  )(bookId);
}
