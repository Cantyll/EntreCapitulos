import type { BodyDoc } from '@/lib/session-body';

/*
 * Formas dos dados que as páginas públicas usam. São objetos simples (só texto, número e booleano):
 * o `unstable_cache` guarda tudo como JSON, então nada aqui pode ser `Date`, `Map` ou classe.
 */

export type BookStatus = 'reading' | 'finished' | 'queued';

export type PublicBook = {
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
  /** Datas de calendário do banco ("2026-09-02"). */
  startedAt: string | null;
  finishedAt: string | null;
};

/** O que uma lista de sessões precisa. Nunca traz o `body`. */
export type SessionSummary = {
  id: string;
  bookId: string;
  number: number;
  chapterFrom: number;
  chapterTo: number;
  title: string;
  excerpt: string | null;
  rating: number | null;
  /** `timestamptz` como texto: formatado com `formatDayMonth`, nunca comparado como Date. */
  publishedAt: string | null;
  readMinutes: number | null;
  membersOnly: boolean;
  /**
   * Comentários APROVADOS. Vem do cache `comment-counts` (sessões públicas) ou do embed da leitura
   * por pessoa (só para membros); as listas em cache de sessões não carregam isto, então o `mapper`
   * começa em 0 e quem monta a página (`loaders.ts`) preenche.
   */
  commentCount: number;
};

export type SessionNoteView = {
  id: string;
  kind: 'quote' | 'note';
  text: string;
  reference: string | null;
};

export type SessionQuestionView = { id: string; text: string };

export type SessionDetail = SessionSummary & {
  /** `comments_open`: com `false` a página esconde o compositor e mantém os comentários existentes. */
  commentsOpen: boolean;
  /** `null` quando o texto salvo não passa no esquema (a página avisa em vez de quebrar). */
  body: BodyDoc | null;
  notes: SessionNoteView[];
  questions: SessionQuestionView[];
};

/** Uma nota para "Anotações na margem" da página do livro. */
export type MarginNote = SessionNoteView & {
  sessionNumber: number;
  chapterTo: number;
  publishedAt: string | null;
};
