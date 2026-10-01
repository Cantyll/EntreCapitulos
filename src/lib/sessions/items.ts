import type { SupabaseClient } from '@supabase/supabase-js';

import { logFailure } from '@/lib/auth/log';
import type { Database } from '@/lib/supabase/database.types';

import { SESSION_MESSAGES, sessionErrorMessage } from './errors';
import { noteSchema, questionSchema, uuidSchema } from './validation';

/*
 * Trechos/anotações e perguntas de uma sessão. Cada operação é independente do salvamento do texto
 * (não passa pelo autosave) e NÃO mexe na linha de `reading_sessions`, então não invalida o token
 * `updated_at` do editor. A ordem é a coluna `position`.
 */

type Client = SupabaseClient<Database>;

export type NoteItem = {
  id: string;
  kind: 'quote' | 'note';
  text: string;
  reference: string;
  position: number;
};
export type QuestionItem = { id: string; text: string; position: number };

export type ItemResult<T> = { ok: true; item: T } | { ok: false; message: string };
export type ListResult<T> = { ok: true; items: T[] } | { ok: false; message: string };
export type DoneResult = { ok: true } | { ok: false; message: string };

const fail = (message: string = SESSION_MESSAGES.generic) => ({ ok: false as const, message });

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? SESSION_MESSAGES.generic;
}

const toNote = (row: Database['public']['Tables']['session_notes']['Row']): NoteItem => ({
  id: row.id,
  kind: row.kind === 'note' ? 'note' : 'quote',
  text: row.text,
  reference: row.reference ?? '',
  position: row.position,
});

// --- Trechos e anotações ---------------------------------------------------------------------------

export async function addNote(
  supabase: Client,
  sessionId: string,
  raw: unknown,
): Promise<ItemResult<NoteItem>> {
  if (!uuidSchema.safeParse(sessionId).success) return fail(SESSION_MESSAGES.session_not_found);
  const parsed = noteSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  try {
    const { data: last, error: lastError } = await supabase
      .from('session_notes')
      .select('position')
      .eq('session_id', sessionId)
      .order('position', { ascending: false })
      .limit(1);
    if (lastError) throw lastError;
    const { data, error } = await supabase
      .from('session_notes')
      .insert({
        session_id: sessionId,
        kind: parsed.data.kind,
        text: parsed.data.text,
        reference: parsed.data.reference || null,
        position: (last?.[0]?.position ?? -1) + 1,
      })
      .select('*')
      .single();
    if (error) {
      logFailure('notes.add', error);
      return fail(sessionErrorMessage(error));
    }
    return { ok: true, item: toNote(data) };
  } catch (error) {
    logFailure('notes.add', error);
    return fail();
  }
}

export async function updateNote(
  supabase: Client,
  noteId: string,
  raw: unknown,
): Promise<ItemResult<NoteItem>> {
  if (!uuidSchema.safeParse(noteId).success) return fail();
  const parsed = noteSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  try {
    const { data, error } = await supabase
      .from('session_notes')
      .update({
        kind: parsed.data.kind,
        text: parsed.data.text,
        reference: parsed.data.reference || null,
      })
      .eq('id', noteId)
      .select('*');
    if (error) {
      logFailure('notes.update', error);
      return fail(sessionErrorMessage(error));
    }
    const row = data?.[0];
    return row
      ? { ok: true, item: toNote(row) }
      : fail('Este item não existe mais. Atualize a página.');
  } catch (error) {
    logFailure('notes.update', error);
    return fail();
  }
}

export async function removeNote(supabase: Client, noteId: string): Promise<DoneResult> {
  if (!uuidSchema.safeParse(noteId).success) return fail();
  try {
    const { error } = await supabase.from('session_notes').delete().eq('id', noteId);
    if (error) {
      logFailure('notes.remove', error);
      return fail(sessionErrorMessage(error));
    }
    return { ok: true };
  } catch (error) {
    logFailure('notes.remove', error);
    return fail();
  }
}

/**
 * Nova ordem: a lista completa de ids. Precisa ser exatamente o conjunto que está no banco (outra
 * aba pode ter adicionado ou removido algo). Uma única instrução, então a ordem nunca fica pela
 * metade.
 */
export async function reorderNotes(
  supabase: Client,
  sessionId: string,
  orderedIds: unknown,
): Promise<ListResult<NoteItem>> {
  if (!uuidSchema.safeParse(sessionId).success) return fail(SESSION_MESSAGES.session_not_found);
  if (!Array.isArray(orderedIds) || !orderedIds.every((id) => uuidSchema.safeParse(id).success)) {
    return fail();
  }
  try {
    const { data: rows, error } = await supabase
      .from('session_notes')
      .select('*')
      .eq('session_id', sessionId);
    if (error) throw error;
    const byId = new Map((rows ?? []).map((row) => [row.id, row]));
    const sameSet =
      byId.size === orderedIds.length &&
      new Set(orderedIds).size === orderedIds.length &&
      orderedIds.every((id: string) => byId.has(id));
    if (!sameSet) return fail('A lista mudou em outra aba. Atualize a página.');

    const next = orderedIds.map((id: string, position) => ({ ...byId.get(id)!, position }));
    const { data, error: upsertError } = await supabase
      .from('session_notes')
      .upsert(next, { onConflict: 'id' })
      .select('*');
    if (upsertError) {
      logFailure('notes.reorder', upsertError);
      return fail(sessionErrorMessage(upsertError));
    }
    return { ok: true, items: (data ?? []).map(toNote).sort((a, b) => a.position - b.position) };
  } catch (error) {
    logFailure('notes.reorder', error);
    return fail();
  }
}

// --- Perguntas para a discussão ----------------------------------------------------------------------

const toQuestion = (
  row: Database['public']['Tables']['session_questions']['Row'],
): QuestionItem => ({ id: row.id, text: row.text, position: row.position });

export async function addQuestion(
  supabase: Client,
  sessionId: string,
  raw: unknown,
): Promise<ItemResult<QuestionItem>> {
  if (!uuidSchema.safeParse(sessionId).success) return fail(SESSION_MESSAGES.session_not_found);
  const parsed = questionSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  try {
    const { data: last, error: lastError } = await supabase
      .from('session_questions')
      .select('position')
      .eq('session_id', sessionId)
      .order('position', { ascending: false })
      .limit(1);
    if (lastError) throw lastError;
    const { data, error } = await supabase
      .from('session_questions')
      .insert({
        session_id: sessionId,
        text: parsed.data.text,
        position: (last?.[0]?.position ?? -1) + 1,
      })
      .select('*')
      .single();
    if (error) {
      logFailure('questions.add', error);
      return fail(sessionErrorMessage(error));
    }
    return { ok: true, item: toQuestion(data) };
  } catch (error) {
    logFailure('questions.add', error);
    return fail();
  }
}

export async function updateQuestion(
  supabase: Client,
  questionId: string,
  raw: unknown,
): Promise<ItemResult<QuestionItem>> {
  if (!uuidSchema.safeParse(questionId).success) return fail();
  const parsed = questionSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  try {
    const { data, error } = await supabase
      .from('session_questions')
      .update({ text: parsed.data.text })
      .eq('id', questionId)
      .select('*');
    if (error) {
      logFailure('questions.update', error);
      return fail(sessionErrorMessage(error));
    }
    const row = data?.[0];
    return row
      ? { ok: true, item: toQuestion(row) }
      : fail('Este item não existe mais. Atualize a página.');
  } catch (error) {
    logFailure('questions.update', error);
    return fail();
  }
}

export async function removeQuestion(supabase: Client, questionId: string): Promise<DoneResult> {
  if (!uuidSchema.safeParse(questionId).success) return fail();
  try {
    const { error } = await supabase.from('session_questions').delete().eq('id', questionId);
    if (error) {
      logFailure('questions.remove', error);
      return fail(sessionErrorMessage(error));
    }
    return { ok: true };
  } catch (error) {
    logFailure('questions.remove', error);
    return fail();
  }
}

export async function reorderQuestions(
  supabase: Client,
  sessionId: string,
  orderedIds: unknown,
): Promise<ListResult<QuestionItem>> {
  if (!uuidSchema.safeParse(sessionId).success) return fail(SESSION_MESSAGES.session_not_found);
  if (!Array.isArray(orderedIds) || !orderedIds.every((id) => uuidSchema.safeParse(id).success)) {
    return fail();
  }
  try {
    const { data: rows, error } = await supabase
      .from('session_questions')
      .select('*')
      .eq('session_id', sessionId);
    if (error) throw error;
    const byId = new Map((rows ?? []).map((row) => [row.id, row]));
    const sameSet =
      byId.size === orderedIds.length &&
      new Set(orderedIds).size === orderedIds.length &&
      orderedIds.every((id: string) => byId.has(id));
    if (!sameSet) return fail('A lista mudou em outra aba. Atualize a página.');

    const next = orderedIds.map((id: string, position) => ({ ...byId.get(id)!, position }));
    const { data, error: upsertError } = await supabase
      .from('session_questions')
      .upsert(next, { onConflict: 'id' })
      .select('*');
    if (upsertError) {
      logFailure('questions.reorder', upsertError);
      return fail(sessionErrorMessage(upsertError));
    }
    return {
      ok: true,
      items: (data ?? []).map(toQuestion).sort((a, b) => a.position - b.position),
    };
  } catch (error) {
    logFailure('questions.reorder', error);
    return fail();
  }
}
