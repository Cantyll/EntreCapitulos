/*
 * Monta a conversa de uma página: junta os comentários aprovados (vindos do cache público) com os
 * PENDENTES do próprio autor (vindos da sessão dele, sem cache). Pura.
 *
 * Duas garantias:
 *  - uma resposta só aparece embaixo de um comentário aprovado que está na página, então a resposta de
 *    um pai removido (ou ainda pendente) nunca aparece solta, como órfã;
 *  - as respostas ficam sempre da mais antiga para a mais nova, e a ordem das páginas segue `order`.
 */

import { compareTimestamps, type CommentCursor, type CommentOrder } from './rules';
import type { CommentRecord, CommentWithReplies } from './types';

type Key = { createdAt: string; id: string };

/** Ordem total por `(created_at, id)`, a mesma do banco. */
export function compareKeys(a: Key, b: Key): number {
  const byTime = compareTimestamps(a.createdAt, b.createdAt);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function mergeThread(input: {
  /** Comentários aprovados de nível superior, já na ordem da página, com as respostas aprovadas. */
  page: readonly CommentWithReplies[];
  hasMore: boolean;
  /** Pendentes do próprio autor (nível superior e respostas). */
  ownPending: readonly CommentRecord[];
  order: CommentOrder;
  /** O cursor com que esta página foi pedida; `null` na primeira. */
  after: CommentCursor | null;
}): CommentWithReplies[] {
  const { page, hasMore, ownPending, order, after } = input;
  const sign = order === 'recentes' ? -1 : 1;
  const cmp = (a: Key, b: Key) => sign * compareKeys(a, b);

  const items: CommentWithReplies[] = page.map((item) => ({
    ...item,
    replies: [...item.replies],
  }));

  // Pendentes de nível superior: entram na página se caem entre o cursor e o último item dela.
  const last = items.at(-1);
  const ownTops = ownPending
    .filter((c) => c.parentId === null && c.status === 'pending')
    .filter((c) => (after === null ? true : cmp(c, after) > 0))
    .filter((c) => (hasMore && last ? cmp(c, last) <= 0 : true))
    .map((c): CommentWithReplies => ({ ...c, replies: [], repliesTruncated: false }));

  const merged = [...items, ...ownTops].sort(cmp);

  // Respostas pendentes: só embaixo de um pai aprovado desta página.
  const byId = new Map(merged.map((item) => [item.id, item]));
  for (const reply of ownPending) {
    if (reply.parentId === null || reply.status !== 'pending') continue;
    const parent = byId.get(reply.parentId);
    if (parent && parent.status === 'approved') parent.replies.push({ ...reply });
  }
  for (const item of merged) item.replies.sort(compareKeys);

  return merged;
}
