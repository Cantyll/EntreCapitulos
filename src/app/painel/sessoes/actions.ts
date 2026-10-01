'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/auth/session';
import {
  addNote,
  addQuestion,
  removeNote,
  removeQuestion,
  reorderNotes,
  reorderQuestions,
  updateNote,
  updateQuestion,
  type DoneResult,
  type ItemResult,
  type ListResult,
  type NoteItem,
  type QuestionItem,
} from '@/lib/sessions/items';
import {
  deleteDraftSession,
  publishSession,
  saveSession,
  unpublishSession,
  type PublishOutcome,
  type SaveOutcome,
  type SimpleOutcome,
} from '@/lib/sessions/service';
import { SESSION_MESSAGES } from '@/lib/sessions/errors';
import { uuidSchema } from '@/lib/sessions/validation';
import { createClient } from '@/lib/supabase/server';

/*
 * Server Actions do editor de sessões. TODAS começam com `requireRole('admin')` (o teste-guarda
 * confere uma chamada por action) e o RLS do banco confere de novo. Quem decide o que entra na
 * linha é `src/lib/sessions/service.ts`: o cliente só manda a lista fixa de campos. O autosave não
 * invalida nenhum cache; só salvar uma sessão que já está no ar, publicar, voltar para rascunho e
 * excluir mexem nas páginas públicas ou na lista.
 */

/** Páginas públicas e cabeçalho dependem de sessões e do capítulo atual do livro. */
function refreshPublic() {
  revalidatePath('/', 'layout');
}

const badId = { kind: 'not_found' } as const;

export async function saveSessionAction(input: {
  sessionId: string | null;
  expectedUpdatedAt: string | null;
  fields: unknown;
}): Promise<SaveOutcome> {
  await requireRole('admin');
  if (input.sessionId !== null && !uuidSchema.safeParse(input.sessionId).success) return badId;
  if (input.expectedUpdatedAt !== null && typeof input.expectedUpdatedAt !== 'string') return badId;

  const supabase = await createClient();
  const outcome = await saveSession(supabase, {
    sessionId: input.sessionId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    fields: input.fields,
  });
  if (outcome.kind === 'ok' && outcome.status === 'published') refreshPublic();
  return outcome;
}

export async function publishSessionAction(input: {
  sessionId: string;
  expectedUpdatedAt: string;
  fields: unknown;
}): Promise<PublishOutcome> {
  await requireRole('admin');
  if (!uuidSchema.safeParse(input.sessionId).success) return badId;

  const supabase = await createClient();
  const outcome = await publishSession(supabase, {
    sessionId: input.sessionId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    fields: input.fields,
  });
  if (outcome.kind === 'published') refreshPublic();
  return outcome;
}

export async function unpublishSessionAction(sessionId: string): Promise<SimpleOutcome> {
  await requireRole('admin');
  if (!uuidSchema.safeParse(sessionId).success) {
    return { ok: false, message: SESSION_MESSAGES.session_not_found };
  }
  const supabase = await createClient();
  const result = await unpublishSession(supabase, sessionId);
  if (result.ok) refreshPublic();
  return result;
}

export async function deleteDraftAction(sessionId: string): Promise<SimpleOutcome> {
  await requireRole('admin');
  if (!uuidSchema.safeParse(sessionId).success) {
    return { ok: false, message: SESSION_MESSAGES.session_not_found };
  }
  const supabase = await createClient();
  const result = await deleteDraftSession(supabase, sessionId);
  if (result.ok) revalidatePath('/painel/sessoes');
  return result;
}

// --- Trechos e anotações ---------------------------------------------------------------------------

export async function addNoteAction(
  sessionId: string,
  input: unknown,
): Promise<ItemResult<NoteItem>> {
  await requireRole('admin');
  return addNote(await createClient(), sessionId, input);
}

export async function updateNoteAction(
  noteId: string,
  input: unknown,
): Promise<ItemResult<NoteItem>> {
  await requireRole('admin');
  return updateNote(await createClient(), noteId, input);
}

export async function removeNoteAction(noteId: string): Promise<DoneResult> {
  await requireRole('admin');
  return removeNote(await createClient(), noteId);
}

export async function reorderNotesAction(
  sessionId: string,
  orderedIds: string[],
): Promise<ListResult<NoteItem>> {
  await requireRole('admin');
  return reorderNotes(await createClient(), sessionId, orderedIds);
}

// --- Perguntas para a discussão -------------------------------------------------------------------

export async function addQuestionAction(
  sessionId: string,
  input: unknown,
): Promise<ItemResult<QuestionItem>> {
  await requireRole('admin');
  return addQuestion(await createClient(), sessionId, input);
}

export async function updateQuestionAction(
  questionId: string,
  input: unknown,
): Promise<ItemResult<QuestionItem>> {
  await requireRole('admin');
  return updateQuestion(await createClient(), questionId, input);
}

export async function removeQuestionAction(questionId: string): Promise<DoneResult> {
  await requireRole('admin');
  return removeQuestion(await createClient(), questionId);
}

export async function reorderQuestionsAction(
  sessionId: string,
  orderedIds: string[],
): Promise<ListResult<QuestionItem>> {
  await requireRole('admin');
  return reorderQuestions(await createClient(), sessionId, orderedIds);
}
