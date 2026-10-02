/*
 * De registro do banco para o que a tela precisa, puro: o tempo relativo já calculado (no servidor, para o
 * texto não mudar entre o HTML e a hidratação), "é meu" como booleano (o id de quem vê não vai para o
 * navegador) e a cobertura de spoiler decidida na tela (depende do progresso, que muda ao vivo).
 */

import { formatRelativeTime } from '@/lib/site';

import type { CommentRecord, CommentRole, CommentWithReplies } from './types';

export type DisplayComment = {
  id: string;
  authorName: string;
  authorRole: CommentRole;
  body: string;
  /** Chip "leu até o cap. X": só quando se sabe (1 ou mais). */
  readUpTo: number | null;
  spoilerUpTo: number | null;
  /** Pendente de moderação (só o próprio autor chega a ver isto). */
  pending: boolean;
  /** Quem está vendo é o autor: o comentário nunca fica coberto para ele. */
  isOwn: boolean;
  /** Texto opaco do banco, para `<time dateTime>`. */
  createdAt: string;
  timeText: string;
  replies: DisplayComment[];
  repliesTruncated: boolean;
};

function toDisplayRecord(
  record: CommentRecord,
  viewerId: string | null,
  now: Date,
): DisplayComment {
  return {
    id: record.id,
    authorName: record.authorName,
    authorRole: record.authorRole,
    body: record.body,
    readUpTo: record.readUpTo !== null && record.readUpTo >= 1 ? record.readUpTo : null,
    spoilerUpTo: record.spoilerUpTo,
    pending: record.status === 'pending',
    isOwn: viewerId !== null && record.authorId === viewerId,
    createdAt: record.createdAt,
    timeText: formatRelativeTime(record.createdAt, now),
    replies: [],
    repliesTruncated: false,
  };
}

export function toDisplayThread(
  items: readonly CommentWithReplies[],
  viewerId: string | null,
  now: Date,
): DisplayComment[] {
  return items.map((item) => ({
    ...toDisplayRecord(item, viewerId, now),
    replies: item.replies.map((reply) => toDisplayRecord(reply, viewerId, now)),
    repliesTruncated: item.repliesTruncated,
  }));
}

/** Quantos comentários da lista estão cobertos para quem vê: "N comentários falam de capítulos depois…". */
export function countCovered(
  items: readonly DisplayComment[],
  covered: (comment: DisplayComment) => boolean,
): number {
  let count = 0;
  for (const item of items) {
    if (covered(item)) count += 1;
    for (const reply of item.replies) if (covered(reply)) count += 1;
  }
  return count;
}
