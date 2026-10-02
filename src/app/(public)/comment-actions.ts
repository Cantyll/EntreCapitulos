'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { logFailure } from '@/lib/auth/log';
import { requireUser } from '@/lib/auth/session';
import {
  COMMENT_MESSAGES,
  classifyCommentError,
  isUuid,
  parseCommentOrder,
  parseCursor,
  parseSpoilerUpTo,
  validateCommentBody,
  type CommentCursor,
  type CommentMessageKey,
} from '@/lib/comments';
import type { CommentActionState } from '@/lib/comments/action-state';
import { toDisplayThread, type DisplayComment } from '@/lib/comments/display';
import { loadDiscussionPage } from '@/lib/comments/queries';
import { getPublicSessions } from '@/lib/public/queries';
import { getProgressFor, getViewer } from '@/lib/public/person';
import { invalidateComments } from '@/lib/public/tags';
import { createClient } from '@/lib/supabase/server';

/*
 * Ações dos comentários feitas por quem lê. O cliente só manda: sessão, comentário-pai, texto e o capítulo
 * do aviso de spoiler. Status, autor, `read_up_to`, id e data NUNCA vêm dele: o status é decidido por um
 * trigger do banco, o autor é quem está logado, `read_up_to` vem do progresso no servidor.
 */

const fail = (code: CommentMessageKey): CommentActionState => ({
  status: 'error',
  message: COMMENT_MESSAGES[code],
  code,
});

const text = (value: FormDataEntryValue | null): string => (typeof value === 'string' ? value : '');

type SessionRow = {
  id: string;
  chapter_to: number;
  book_id: string;
  books: { id: string; slug: string; total_chapters: number } | null;
};

export async function createComment(
  _previous: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  // Sem sessão (ou login anônimo) o `requireUser` leva para /entrar e volta para a sessão. Fica fora do
  // try: o redirect do Next é uma exceção e não pode ser engolida.
  const user = await requireUser();

  const sessionId = text(formData.get('sessionId'));
  const rawParent = text(formData.get('parentId'));
  if (!isUuid(sessionId) || (rawParent !== '' && !isUuid(rawParent))) return fail('not_found');

  const checked = validateCommentBody(formData.get('body'));
  if (!checked.ok) return fail(checked.error);

  // O banco recusa de qualquer jeito (`profile_incomplete`), mas evita a viagem.
  if (!user.nameConfirmed) return fail('profile_incomplete');

  try {
    const supabase = await createClient();
    // O RLS decide se esta pessoa enxerga a sessão (sessão só para membros, rascunho).
    const { data: session, error: sessionError } = await supabase
      .from('reading_sessions')
      .select('id, chapter_to, book_id, books(id, slug, total_chapters)')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    const row = session as unknown as SessionRow | null;
    if (!row?.books) return fail('not_found');

    const spoiler = parseSpoilerUpTo(
      formData.get('spoilerUpTo'),
      row.chapter_to,
      row.books.total_chapters,
    );
    if (!spoiler.ok) return fail('invalid_spoiler');

    // O que a pessoa tem marcado agora: o mesmo valor que decide a cobertura na tela. Desconhecido = 0.
    const progress = await getProgressFor({
      id: row.books.id,
      slug: row.books.slug,
      totalChapters: row.books.total_chapters,
    });

    // Lista fixa de campos. Nunca `status`.
    const { data, error } = await supabase
      .from('comments')
      .insert({
        id: randomUUID(),
        session_id: row.id,
        author_id: user.id,
        parent_id: rawParent === '' ? null : rawParent,
        body: checked.body,
        read_up_to: progress ?? 0,
        spoiler_up_to: spoiler.value,
      })
      .select('status')
      .single();

    if (error) {
      const code = classifyCommentError(error);
      if (code === 'generic') logFailure('comments.create', error);
      return fail(code);
    }

    invalidateComments(row.id);
    // A lista pública já expirou pela tag; isto refaz as páginas que a pessoa já abriu (contagens).
    revalidatePath('/', 'layout');

    const outcome = data.status === 'approved' ? 'approved' : 'pending';
    return {
      status: 'ok',
      outcome,
      message:
        outcome === 'approved'
          ? 'Comentário publicado.'
          : 'Recebemos seu comentário. Ele aparece depois que a moderação aprovar.',
    };
  } catch (error) {
    logFailure('comments.create', error);
    return fail('generic');
  }
}

export type MoreCommentsResult =
  | { ok: true; items: DisplayComment[]; nextCursor: CommentCursor | null }
  | { ok: false; message: string };

/**
 * "Carregar mais": a página seguinte, pelo cursor `(created_at, id)`. Sessão pública: do cache
 * compartilhado. Sessão só para membros: com a sessão de quem pede (o RLS decide). Os pendentes do
 * próprio autor são mesclados aqui, como na primeira página.
 */
export async function loadMoreComments(
  sessionId: string,
  order: string,
  cursor: unknown,
): Promise<MoreCommentsResult> {
  const parsedCursor = parseCursor(cursor);
  if (!isUuid(sessionId) || parsedCursor === null) {
    return { ok: false, message: 'Não foi possível carregar mais agora.' };
  }

  try {
    const [viewer, publicSessions] = await Promise.all([getViewer(), getPublicSessions()]);
    const membersOnly = !publicSessions.some((s) => s.id === sessionId);
    const page = await loadDiscussionPage({
      sessionId,
      membersOnly,
      viewerId: viewer?.id ?? null,
      order: parseCommentOrder(order),
      cursor: parsedCursor,
    });
    return {
      ok: true,
      items: toDisplayThread(page.items, viewer?.id ?? null, new Date()),
      nextCursor: page.nextCursor,
    };
  } catch (error) {
    logFailure('comments.more', error);
    return { ok: false, message: 'Não foi possível carregar mais agora. Tente de novo.' };
  }
}
