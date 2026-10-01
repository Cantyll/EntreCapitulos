import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logFailure } from '@/lib/auth/log';
import { defaultRange } from '@/lib/session-body';
import type { SessionSnapshot } from '@/lib/session-editor/snapshot';
import type { Database } from '@/lib/supabase/database.types';

import type { NoteItem, QuestionItem } from './items';
import { rowToSnapshot } from './service';

type Client = SupabaseClient<Database>;

export type SessionStatus = 'draft' | 'published';

export type SessionListItem = {
  id: string;
  number: number;
  title: string;
  chapterFrom: number;
  chapterTo: number;
  status: SessionStatus;
  bookTitle: string;
  bookSlug: string;
  commentCount: number;
  /** Publicada: a data da publicação. Rascunho: a última alteração. */
  date: string;
};

/** Rascunhos primeiro (mais recente no topo), depois as publicadas, da mais nova para a mais antiga. */
export async function getAdminSessions(supabase: Client): Promise<SessionListItem[]> {
  const { data, error } = await supabase
    .from('reading_sessions')
    .select(
      'id, number, title, chapter_from, chapter_to, status, published_at, updated_at, books(title, slug)',
    );
  if (error) throw error;

  // Contagem à parte: uma falha aqui não derruba a lista, só zera a coluna.
  const counts = new Map<string, number>();
  try {
    const { data: rows, error: countError } = await supabase
      .from('comments')
      .select('session_id')
      .eq('status', 'approved');
    if (countError) throw countError;
    for (const row of rows ?? []) counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1);
  } catch (countError) {
    logFailure('sessions: contagem de comentários', countError);
  }

  const items = (data ?? []).map((row): SessionListItem => {
    const book = row.books as unknown as { title: string; slug: string } | null;
    const published = row.status === 'published';
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      chapterFrom: row.chapter_from,
      chapterTo: row.chapter_to,
      status: published ? 'published' : 'draft',
      bookTitle: book?.title ?? '',
      bookSlug: book?.slug ?? '',
      commentCount: counts.get(row.id) ?? 0,
      date: (published ? row.published_at : null) ?? row.updated_at,
    };
  });

  const byDateDesc = (a: SessionListItem, b: SessionListItem) => b.date.localeCompare(a.date);
  return [
    ...items.filter((s) => s.status === 'draft').sort(byDateDesc),
    ...items.filter((s) => s.status === 'published').sort(byDateDesc),
  ];
}

export type EditorBook = { id: string; title: string; slug: string; totalChapters: number };

export type EditorData = {
  id: string;
  number: number;
  status: SessionStatus;
  /** `updated_at` como TEXTO opaco (microssegundos). Nunca converter para Date. */
  updatedAt: string;
  snapshot: SessionSnapshot;
  book: EditorBook;
  notes: NoteItem[];
  questions: QuestionItem[];
  /** Comentários de qualquer status: com algum, a sessão não volta para rascunho. */
  commentCount: number;
};

export type EditorLoad =
  | { kind: 'ok'; data: EditorData }
  | { kind: 'not_found' }
  /** O corpo salvo não passa no esquema: abrir no editor e salvar o apagaria. */
  | { kind: 'unreadable'; number: number };

export async function getEditorData(supabase: Client, id: string): Promise<EditorLoad> {
  const { data: row, error } = await supabase
    .from('reading_sessions')
    .select('*, books(id, title, slug, total_chapters)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return { kind: 'not_found' };

  const snapshot = rowToSnapshot(row);
  if (!snapshot) return { kind: 'unreadable', number: row.number };

  const [notes, questions, comments] = await Promise.all([
    supabase.from('session_notes').select('*').eq('session_id', id).order('position'),
    supabase.from('session_questions').select('*').eq('session_id', id).order('position'),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('session_id', id),
  ]);
  if (notes.error) throw notes.error;
  if (questions.error) throw questions.error;
  if (comments.error) throw comments.error;

  const book = row.books as unknown as {
    id: string;
    title: string;
    slug: string;
    total_chapters: number;
  };
  return {
    kind: 'ok',
    data: {
      id: row.id,
      number: row.number,
      status: row.status === 'published' ? 'published' : 'draft',
      updatedAt: row.updated_at,
      snapshot,
      book: { id: book.id, title: book.title, slug: book.slug, totalChapters: book.total_chapters },
      notes: (notes.data ?? []).map((n) => ({
        id: n.id,
        kind: n.kind === 'note' ? 'note' : 'quote',
        text: n.text,
        reference: n.reference ?? '',
        position: n.position,
      })),
      questions: (questions.data ?? []).map((q) => ({
        id: q.id,
        text: q.text,
        position: q.position,
      })),
      commentCount: comments.count ?? 0,
    },
  };
}

export type NewSessionContext =
  | { kind: 'no_book' }
  | {
      kind: 'ready';
      book: EditorBook;
      /** Rascunho mais recente do livro em leitura, se houver. */
      draft: { id: string; number: number; title: string } | null;
      /** `null` quando todos os capítulos do livro já têm sessão. */
      range: { from: number; to: number } | null;
      nextNumber: number;
    };

export async function getNewSessionContext(supabase: Client): Promise<NewSessionContext> {
  const { data: book, error } = await supabase
    .from('books')
    .select('id, title, slug, total_chapters')
    .eq('status', 'reading')
    .maybeSingle();
  if (error) throw error;
  if (!book) return { kind: 'no_book' };

  const { data: sessions, error: sessionsError } = await supabase
    .from('reading_sessions')
    .select('id, number, title, chapter_to, status, updated_at')
    .eq('book_id', book.id);
  if (sessionsError) throw sessionsError;

  const all = sessions ?? [];
  const lastTo = all.reduce((max, s) => Math.max(max, s.chapter_to), 0);
  const draft = all
    .filter((s) => s.status === 'draft')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];

  return {
    kind: 'ready',
    book: { id: book.id, title: book.title, slug: book.slug, totalChapters: book.total_chapters },
    draft: draft ? { id: draft.id, number: draft.number, title: draft.title } : null,
    range: defaultRange(lastTo || null, book.total_chapters),
    nextNumber: all.reduce((max, s) => Math.max(max, s.number), 0) + 1,
  };
}
