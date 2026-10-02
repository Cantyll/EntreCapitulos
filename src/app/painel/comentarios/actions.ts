'use server';

import { revalidatePath } from 'next/cache';

import { logFailure } from '@/lib/auth/log';
import { requireRole } from '@/lib/auth/session';
import {
  MODERATION_MESSAGES,
  classifyModerationError,
  isUuid,
  parseSpoilerUpTo,
  parseVisibleIds,
  unflaggedPending,
  type ModerationMessageKey,
} from '@/lib/comments';
import { invalidateComments } from '@/lib/public/tags';
import { createClient } from '@/lib/supabase/server';

/*
 * Moderação de comentários. Cada action confere o papel no servidor (`staff`: administradora e
 * moderadora) e o banco confere de novo (RLS: `is_staff()`, e só `status` e `spoiler_up_to` mudam). Nenhum
 * comentário é apagado: remover é `status = 'removed'`.
 *
 * Tolerância a conflito: toda mudança é um `UPDATE … WHERE status = <estado esperado>` e confere se alguma
 * linha mudou. Se outra pessoa moderou antes, nada muda e a resposta é "já moderado".
 */

export type ModerationResult = { ok: true; message: string } | { ok: false; message: string };

const fail = (key: ModerationMessageKey): ModerationResult => ({
  ok: false,
  message: MODERATION_MESSAGES[key],
});

/** Depois de moderar: o cache público da sessão e o contador do painel. */
function refresh(sessionIds: Iterable<string>) {
  for (const id of new Set(sessionIds)) invalidateComments(id);
  revalidatePath('/painel', 'layout');
}

type Change = {
  patch: { status?: 'approved' | 'pending' | 'removed'; spoiler_up_to?: number | null };
  /** Estados em que a mudança vale; fora deles é conflito. */
  from: readonly ('pending' | 'approved' | 'removed')[];
  done: string;
};

async function change(id: string, spec: Change): Promise<ModerationResult> {
  if (!isUuid(id)) return fail('invalid_input');
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('comments')
      .update(spec.patch)
      .eq('id', id)
      .in('status', spec.from)
      .select('id, session_id');
    if (error) {
      const key = classifyModerationError(error);
      if (key === 'generic') logFailure('comments.moderate', error);
      return fail(key);
    }
    if (!data || data.length === 0) return fail('conflict');
    refresh(data.map((row) => row.session_id));
    return { ok: true, message: spec.done };
  } catch (error) {
    logFailure('comments.moderate', error);
    return fail('generic');
  }
}

export async function approveComment(id: string): Promise<ModerationResult> {
  await requireRole('staff');
  return change(id, {
    patch: { status: 'approved' },
    from: ['pending'],
    done: 'Comentário aprovado.',
  });
}

export async function removeComment(id: string): Promise<ModerationResult> {
  await requireRole('staff');
  return change(id, {
    patch: { status: 'removed' },
    from: ['pending', 'approved'],
    done: 'Comentário removido.',
  });
}

/** Restaurar devolve o comentário para "Para aprovar": nada volta ao ar sem uma decisão. */
export async function restoreComment(id: string): Promise<ModerationResult> {
  await requireRole('staff');
  return change(id, {
    patch: { status: 'pending' },
    from: ['removed'],
    done: 'Comentário restaurado. Ele voltou para "Para aprovar".',
  });
}

/** O capítulo do aviso tem de ficar entre `chapter_to + 1` e o total do livro da sessão do comentário. */
async function validSpoiler(id: string, upTo: unknown): Promise<number | 'invalid' | 'missing'> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('comments')
    .select('session:reading_sessions!comments_session_id_fkey(chapter_to, books(total_chapters))')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  const session = (
    data as unknown as {
      session: { chapter_to: number; books: { total_chapters: number } | null } | null;
    } | null
  )?.session;
  if (!session?.books) return 'missing';
  const checked = parseSpoilerUpTo(upTo, session.chapter_to, session.books.total_chapters);
  return checked.ok && checked.value !== null ? checked.value : 'invalid';
}

/** "Aprovar como spoiler": aprova e marca até que capítulo ele fala, numa só gravação. */
export async function approveAsSpoiler(id: string, upTo: unknown): Promise<ModerationResult> {
  await requireRole('staff');
  if (!isUuid(id)) return fail('invalid_input');
  try {
    const value = await validSpoiler(id, upTo);
    if (value === 'missing') return fail('not_found');
    if (value === 'invalid') return fail('invalid_spoiler');
    return await change(id, {
      patch: { status: 'approved', spoiler_up_to: value },
      from: ['pending'],
      done: `Comentário aprovado como spoiler até o capítulo ${value}.`,
    });
  } catch (error) {
    logFailure('comments.moderate', error);
    return fail('generic');
  }
}

/** "Marcar spoiler" (`upTo` = capítulo) e "Tirar spoiler" (`upTo` = `null`) de um comentário aprovado. */
export async function setCommentSpoiler(id: string, upTo: unknown): Promise<ModerationResult> {
  await requireRole('staff');
  if (!isUuid(id)) return fail('invalid_input');
  if (upTo === null) {
    return change(id, {
      patch: { spoiler_up_to: null },
      from: ['approved'],
      done: 'Aviso de spoiler retirado.',
    });
  }
  try {
    const value = await validSpoiler(id, upTo);
    if (value === 'missing') return fail('not_found');
    if (value === 'invalid') return fail('invalid_spoiler');
    return await change(id, {
      patch: { spoiler_up_to: value },
      from: ['approved'],
      done: `Marcado como spoiler até o capítulo ${value}.`,
    });
  } catch (error) {
    logFailure('comments.moderate', error);
    return fail('generic');
  }
}

/**
 * "Aprovar os sem alerta DESTA página". Recebe os ids que a pessoa está vendo (no máximo uma página) e
 * revalida cada um no servidor: só aprova o que ainda está pendente e SEM alerta; ignora o resto
 * (já moderado por outra pessoa, com alerta, inexistente) e qualquer id que a tela não tenha mandado.
 * Nunca aprova comentários de outras páginas: aprovar às cegas faria o contador de aprovados de cada
 * autor subir sem revisão e liberaria a publicação direta.
 */
export async function approveUnflaggedOnPage(visibleIds: unknown): Promise<ModerationResult> {
  await requireRole('staff');
  const ids = parseVisibleIds(visibleIds);
  if (ids.length === 0) return fail('invalid_input');

  try {
    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from('comments')
      .select('id, status, flag:comment_flags(reason)')
      .in('id', ids);
    if (error) throw error;

    const eligible = unflaggedPending(
      ids,
      (rows ?? []).map((row) => ({
        id: row.id,
        status: row.status,
        hasFlag: (row as unknown as { flag: unknown }).flag !== null,
      })),
    );
    if (eligible.length === 0) {
      return { ok: true, message: 'Nenhum comentário sem alerta para aprovar nesta página.' };
    }

    const { data, error: updateError } = await supabase
      .from('comments')
      .update({ status: 'approved' })
      .in('id', eligible)
      .eq('status', 'pending')
      .select('id, session_id');
    if (updateError) throw updateError;

    const approved = data ?? [];
    refresh(approved.map((row) => row.session_id));
    return {
      ok: true,
      message:
        approved.length === 1
          ? '1 comentário sem alerta aprovado.'
          : `${approved.length} comentários sem alerta aprovados.`,
    };
  } catch (error) {
    const key = classifyModerationError(error as { code?: string });
    if (key === 'generic') logFailure('comments.moderate', error);
    return fail(key);
  }
}
