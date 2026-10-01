import type { SupabaseClient } from '@supabase/supabase-js';

import { logFailure } from '@/lib/auth/log';
import {
  autoExcerpt,
  BODY_ISSUE_MESSAGES,
  checkDividers,
  isBodyEmpty,
  parseBody,
  readMinutes,
  type BodyDoc,
} from '@/lib/session-body';
import { defaultRange } from '@/lib/session-body';
import { sameToken, type ServerVersion, type SessionSnapshot } from '@/lib/session-editor/snapshot';
import type { Database, Json } from '@/lib/supabase/database.types';

import {
  chapterBeyondTotalMessage,
  overlapMessage,
  SESSION_MESSAGES,
  sessionErrorMessage,
} from './errors';
import { sessionFieldsSchema, UNTITLED, type SessionFields } from './validation';

/*
 * Regras de gravar uma sessão no servidor, sem `next/*` (por isso testável com um cliente falso).
 * As Server Actions de `src/app/painel/sessoes/actions.ts` só conferem o papel e chamam isto.
 *
 * O que o cliente manda é a lista fixa de `sessionFieldsSchema`. Status, published_at, book_id,
 * number e id NUNCA vêm dele: o status só muda pelas funções publish_session/unpublish_session, o
 * livro é o que está em leitura, e o número é o maior do livro + 1. O token `expectedUpdatedAt` é
 * o `updated_at` como TEXTO opaco (microssegundos): a conferência é igualdade de texto, no código e
 * de novo no `UPDATE ... WHERE updated_at = ...`.
 */

type Client = SupabaseClient<Database>;
type SessionRow = Database['public']['Tables']['reading_sessions']['Row'];

export type SaveOutcome =
  | {
      kind: 'ok';
      updatedAt: string;
      sessionId: string;
      number: number;
      /** Sessão no ar: quem chama invalida as páginas públicas. */
      status: 'draft' | 'published';
    }
  | { kind: 'conflict'; server: ServerVersion }
  | { kind: 'not_found' }
  | {
      kind: 'rejected';
      message: string;
      revert?: Partial<SessionSnapshot>;
      fixTotalBookId?: string;
    }
  | { kind: 'failed'; message?: string };

type Rejected = Extract<SaveOutcome, { kind: 'rejected' }>;
type Failed = Extract<SaveOutcome, { kind: 'failed' }>;

const rejected = (
  message: string,
  extra: { revert?: Partial<SessionSnapshot>; fixTotalBookId?: string } = {},
): Rejected => ({ kind: 'rejected', message, ...extra });

const failed = (message: string = SESSION_MESSAGES.generic): Failed => ({
  kind: 'failed',
  message,
});

/** O que a página e o conflito mostram a partir da linha do banco. `null` = corpo ilegível. */
export function rowToSnapshot(row: SessionRow): SessionSnapshot | null {
  const parsed = parseBody(row.body);
  if (!parsed.ok) return null;
  const auto = autoExcerpt(parsed.doc);
  return {
    title: row.title === UNTITLED ? '' : row.title,
    body: parsed.doc,
    chapterFrom: row.chapter_from,
    chapterTo: row.chapter_to,
    visibility: row.visibility === 'members' ? 'members' : 'public',
    commentsOpen: row.comments_open,
    rating: row.rating,
    // O resumo guardado igual ao automático volta para a tela como "automático" (campo vazio).
    excerpt: !row.excerpt || row.excerpt === auto ? '' : row.excerpt,
  };
}

function serverVersion(row: SessionRow): ServerVersion | null {
  const snapshot = rowToSnapshot(row);
  return snapshot ? { updatedAt: row.updated_at, snapshot } : null;
}

/**
 * Resumo a gravar. Vazio = automático. Um resumo igual ao automático do corpo ANTERIOR também era
 * automático (a pessoa não mexeu), então acompanha o corpo novo; qualquer outro texto é dela.
 */
export function resolveExcerpt(
  typed: string,
  doc: BodyDoc,
  previous: { doc: BodyDoc | null; excerpt: string | null } | null,
): string | null {
  const text = typed.trim();
  const auto = autoExcerpt(doc);
  if (!text) return auto || null;
  if (previous?.doc && text === autoExcerpt(previous.doc)) return auto || null;
  return text;
}

/** O que impede publicar (ou editar uma sessão que já está no ar). `null` = pode. */
export function contentProblem(
  fields: Pick<SessionFields, 'title' | 'chapterFrom' | 'chapterTo'>,
  doc: BodyDoc,
): string | null {
  if (!fields.title.trim()) return 'Dê um título para a sessão.';
  if (isBodyEmpty(doc)) return 'Escreva o relato antes de publicar.';
  const { blocking } = checkDividers(doc, fields.chapterFrom, fields.chapterTo);
  return blocking[0]?.message ?? null;
}

function validate(
  rawFields: unknown,
): { ok: true; fields: SessionFields; doc: BodyDoc } | { ok: false; outcome: SaveOutcome } {
  const parsed = sessionFieldsSchema.safeParse(rawFields);
  if (!parsed.success) {
    return {
      ok: false,
      outcome: rejected(parsed.error.issues[0]?.message ?? SESSION_MESSAGES.generic),
    };
  }
  const body = parseBody(parsed.data.body);
  if (!body.ok) return { ok: false, outcome: rejected(BODY_ISSUE_MESSAGES[body.issue]) };
  return { ok: true, fields: parsed.data, doc: body.doc };
}

/** Colunas que a gravação pode tocar. Nada além destas chega ao banco. */
function patchOf(fields: SessionFields, doc: BodyDoc, excerpt: string | null) {
  return {
    title: fields.title.trim() || UNTITLED,
    body: doc as unknown as Json as NonNullable<Json>,
    chapter_from: fields.chapterFrom,
    chapter_to: fields.chapterTo,
    visibility: fields.visibility,
    comments_open: fields.commentsOpen,
    rating: fields.rating,
    excerpt,
    read_minutes: readMinutes(doc),
  };
}

export type SaveArgs = {
  /** `null` = ainda não existe: cria no livro em leitura. */
  sessionId: string | null;
  expectedUpdatedAt: string | null;
  fields: unknown;
  /** Publicar: confere o conteúdo e o total de capítulos do livro antes de gravar. */
  forPublish?: boolean;
};

export async function saveSession(supabase: Client, args: SaveArgs): Promise<SaveOutcome> {
  const checked = validate(args.fields);
  if (!checked.ok) return checked.outcome;
  try {
    return args.sessionId === null
      ? await createSession(supabase, checked.fields, checked.doc)
      : await updateSession(supabase, args, checked.fields, checked.doc);
  } catch (error) {
    logFailure('sessions.save', error);
    return failed();
  }
}

async function findOverlap(
  supabase: Client,
  bookId: string,
  from: number,
  to: number,
  exceptId: string | null,
): Promise<{ number: number; chapter_from: number; chapter_to: number } | null> {
  let query = supabase
    .from('reading_sessions')
    .select('number, chapter_from, chapter_to')
    .eq('book_id', bookId)
    .lte('chapter_from', to)
    .gte('chapter_to', from)
    .order('number')
    .limit(1);
  if (exceptId) query = query.neq('id', exceptId);
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] ?? null;
}

function overlapOutcome(
  other: { number: number; chapter_from: number; chapter_to: number } | null,
  fields: SessionFields,
  revert: Partial<SessionSnapshot> | undefined,
): SaveOutcome {
  if (!other) return rejected(SESSION_MESSAGES.overlap, { revert });
  const from = Math.max(fields.chapterFrom, other.chapter_from);
  const to = Math.min(fields.chapterTo, other.chapter_to);
  return rejected(overlapMessage(from, to, other.number), { revert });
}

async function createSession(
  supabase: Client,
  fields: SessionFields,
  doc: BodyDoc,
): Promise<SaveOutcome> {
  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('id, total_chapters')
    .eq('status', 'reading')
    .maybeSingle();
  if (bookError) throw bookError;
  if (!book) return rejected('Não há livro em leitura. Comece um livro em Livros.');

  const patch = patchOf(fields, doc, fields.excerpt.trim() || null);

  // O número é o maior do livro + 1; se outra aba criar ao mesmo tempo (23505), tenta de novo.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last, error: lastError } = await supabase
      .from('reading_sessions')
      .select('number, chapter_to')
      .eq('book_id', book.id)
      .order('number', { ascending: false })
      .limit(1);
    if (lastError) throw lastError;
    const number = (last?.[0]?.number ?? 0) + 1;

    const { data, error } = await supabase
      .from('reading_sessions')
      .insert({ ...patch, book_id: book.id, number, status: 'draft' })
      .select('id, number, updated_at')
      .single();
    if (!error) {
      return {
        kind: 'ok',
        updatedAt: data.updated_at,
        sessionId: data.id,
        number: data.number,
        status: 'draft',
      };
    }
    if (error.code === '23505' && attempt < 2) continue;
    if (error.code === '23P01') {
      const other = await findOverlap(
        supabase,
        book.id,
        fields.chapterFrom,
        fields.chapterTo,
        null,
      );
      const { data: all } = await supabase
        .from('reading_sessions')
        .select('chapter_to')
        .eq('book_id', book.id);
      const lastTo = (all ?? []).reduce((max, s) => Math.max(max, s.chapter_to), 0);
      const next = defaultRange(lastTo || null, book.total_chapters);
      return overlapOutcome(
        other,
        fields,
        next ? { chapterFrom: next.from, chapterTo: next.to } : undefined,
      );
    }
    logFailure('sessions.create', error);
    return failed(sessionErrorMessage(error));
  }
  return failed();
}

async function updateSession(
  supabase: Client,
  args: SaveArgs,
  fields: SessionFields,
  doc: BodyDoc,
): Promise<SaveOutcome> {
  const id = args.sessionId!;
  const { data: row, error: readError } = await supabase
    .from('reading_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) return { kind: 'not_found' };

  const conflict = (current: SessionRow): SaveOutcome => {
    const server = serverVersion(current);
    return server
      ? { kind: 'conflict', server }
      : failed('O texto salvo no servidor tem um formato que o editor não reconhece.');
  };
  if (!sameToken(args.expectedUpdatedAt, row.updated_at)) return conflict(row);

  // Sessão no ar (ou indo para o ar): o que o público vai ler precisa estar em ordem.
  const strict = args.forPublish === true || row.status === 'published';
  if (strict) {
    const problem = contentProblem(fields, doc);
    if (problem) return rejected(problem);
  }
  if (args.forPublish) {
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id, total_chapters')
      .eq('id', row.book_id)
      .maybeSingle();
    if (bookError) throw bookError;
    if (!book) return rejected(SESSION_MESSAGES.book_not_found);
    if (fields.chapterTo > book.total_chapters) {
      return rejected(chapterBeyondTotalMessage(book.total_chapters, fields.chapterTo), {
        fixTotalBookId: book.id,
      });
    }
  }

  const previous = {
    doc: parseBody(row.body).ok ? (parseBody(row.body) as { doc: BodyDoc }).doc : null,
    excerpt: row.excerpt,
  };
  const excerpt = strict
    ? resolveExcerpt(fields.excerpt, doc, previous)
    : fields.excerpt.trim() || null;

  const { data, error } = await supabase
    .from('reading_sessions')
    .update(patchOf(fields, doc, excerpt))
    .eq('id', id)
    .eq('updated_at', args.expectedUpdatedAt!)
    .select('id, number, updated_at');

  if (error) {
    if (error.code === '23P01') {
      const other = await findOverlap(
        supabase,
        row.book_id,
        fields.chapterFrom,
        fields.chapterTo,
        id,
      );
      return overlapOutcome(other, fields, {
        chapterFrom: row.chapter_from,
        chapterTo: row.chapter_to,
      });
    }
    logFailure('sessions.update', error);
    return failed(sessionErrorMessage(error));
  }
  const saved = data?.[0];
  if (saved)
    return {
      kind: 'ok',
      updatedAt: saved.updated_at,
      sessionId: saved.id,
      number: saved.number,
      status: row.status === 'published' ? 'published' : 'draft',
    };

  // Nenhuma linha mudou: alguém gravou entre a leitura e a gravação (ou apagou a sessão).
  const { data: current, error: currentError } = await supabase
    .from('reading_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (currentError) throw currentError;
  return current ? conflict(current) : { kind: 'not_found' };
}

// --- Publicar, voltar para rascunho e excluir ---------------------------------------------------

/**
 * Publicar grava o conteúdo ANTES de chamar a função do banco. Se a função falhar, o conteúdo já
 * foi salvo e o `updated_at` mudou: `savedUpdatedAt` devolve o token novo, para o editor não dar
 * conflito consigo mesmo no próximo salvamento.
 */
export type PublishOutcome =
  | { kind: 'published'; number: number }
  | Exclude<SaveOutcome, { kind: 'ok' }>
  | (Extract<SaveOutcome, { kind: 'rejected' | 'failed' }> & { savedUpdatedAt: string });

export async function publishSession(
  supabase: Client,
  args: Omit<SaveArgs, 'forPublish'> & { sessionId: string },
): Promise<PublishOutcome> {
  const saved = await saveSession(supabase, { ...args, forPublish: true });
  if (saved.kind !== 'ok') return saved;

  try {
    const { data, error } = await supabase.rpc('publish_session', { p_session_id: args.sessionId });
    if (error) {
      logFailure('sessions.publish', error);
      return { ...rejected(sessionErrorMessage(error)), savedUpdatedAt: saved.updatedAt };
    }
    return { kind: 'published', number: data.number };
  } catch (error) {
    logFailure('sessions.publish', error);
    return { ...failed(), savedUpdatedAt: saved.updatedAt };
  }
}

export type SimpleOutcome = { ok: true } | { ok: false; message: string };

export async function unpublishSession(
  supabase: Client,
  sessionId: string,
): Promise<SimpleOutcome> {
  try {
    const { error } = await supabase.rpc('unpublish_session', { p_session_id: sessionId });
    if (error) {
      logFailure('sessions.unpublish', error);
      return { ok: false, message: sessionErrorMessage(error) };
    }
    return { ok: true };
  } catch (error) {
    logFailure('sessions.unpublish', error);
    return { ok: false, message: SESSION_MESSAGES.generic };
  }
}

/** Só rascunho. Sessão publicada (com ou sem comentários) nunca é apagada por aqui. */
export async function deleteDraftSession(
  supabase: Client,
  sessionId: string,
): Promise<SimpleOutcome> {
  try {
    const { data, error } = await supabase
      .from('reading_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('status', 'draft')
      .select('id');
    if (error) {
      logFailure('sessions.delete', error);
      return { ok: false, message: sessionErrorMessage(error) };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        message:
          'Só rascunhos podem ser excluídos. Volte a sessão para rascunho antes, se for o caso.',
      };
    }
    return { ok: true };
  } catch (error) {
    logFailure('sessions.delete', error);
    return { ok: false, message: SESSION_MESSAGES.generic };
  }
}
