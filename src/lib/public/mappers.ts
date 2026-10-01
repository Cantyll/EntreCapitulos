import { coverUrl } from '@/lib/books/cover-path';
import { parseBody } from '@/lib/session-body';
import type { Database } from '@/lib/supabase/database.types';

import type {
  BookStatus,
  PublicBook,
  SessionDetail,
  SessionNoteView,
  SessionQuestionView,
  SessionSummary,
} from './types';

type BookRow = Database['public']['Tables']['books']['Row'];
type SessionRow = Database['public']['Tables']['reading_sessions']['Row'];

/** Colunas lidas das listas: tudo menos `body`, `palette` e `theme_tokens`. */
export const BOOK_COLUMNS =
  'id, slug, title, author, synopsis, genres, total_chapters, current_chapter, status, rating, cover_path, started_at, finished_at';
export const SESSION_LIST_COLUMNS =
  'id, book_id, number, chapter_from, chapter_to, title, excerpt, rating, published_at, read_minutes, visibility';
export const SESSION_DETAIL_COLUMNS = `${SESSION_LIST_COLUMNS}, body, session_notes(id, kind, text, reference, position), session_questions(id, text, position)`;

type BookColumnKey =
  | 'id'
  | 'slug'
  | 'title'
  | 'author'
  | 'synopsis'
  | 'genres'
  | 'total_chapters'
  | 'current_chapter'
  | 'status'
  | 'rating'
  | 'cover_path'
  | 'started_at'
  | 'finished_at';

const toStatus = (value: string): BookStatus =>
  value === 'reading' || value === 'finished' ? value : 'queued';

export function toPublicBook(row: Pick<BookRow, BookColumnKey>): PublicBook {
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
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}


type SessionListRow = Pick<
  SessionRow,
  | 'id'
  | 'book_id'
  | 'number'
  | 'chapter_from'
  | 'chapter_to'
  | 'title'
  | 'excerpt'
  | 'rating'
  | 'published_at'
  | 'read_minutes'
  | 'visibility'
>;

export function toSessionSummary(row: SessionListRow): SessionSummary {
  return {
    id: row.id,
    bookId: row.book_id,
    number: row.number,
    chapterFrom: row.chapter_from,
    chapterTo: row.chapter_to,
    title: row.title,
    excerpt: row.excerpt,
    rating: row.rating,
    publishedAt: row.published_at,
    readMinutes: row.read_minutes,
    membersOnly: row.visibility === 'members',
  };
}

type DetailRow = SessionListRow &
  Pick<SessionRow, 'body'> & {
    session_notes: { id: string; kind: string; text: string; reference: string | null; position: number }[] | null;
    session_questions: { id: string; text: string; position: number }[] | null;
  };

export function toSessionDetail(row: DetailRow): SessionDetail {
  const body = parseBody(row.body);
  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const notes: SessionNoteView[] = [...(row.session_notes ?? [])].sort(byPosition).map((n) => ({
    id: n.id,
    kind: n.kind === 'quote' ? 'quote' : 'note',
    text: n.text,
    reference: n.reference,
  }));
  const questions: SessionQuestionView[] = [...(row.session_questions ?? [])]
    .sort(byPosition)
    .map((q) => ({ id: q.id, text: q.text }));
  return { ...toSessionSummary(row), body: body.ok ? body.doc : null, notes, questions };
}
