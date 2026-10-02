import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';

import { parseRole } from '@/lib/auth/roles';
import { createPublicClient } from '@/lib/public/client';
import { commentsTag } from '@/lib/public/tags';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

import {
  COMMENTS_PAGE_SIZE,
  REPLIES_LIMIT,
  nextCursor,
  parseCursor,
  type CommentCursor,
  type CommentOrder,
} from './rules';
import { mergeThread } from './threads';
import type { CommentRecord, CommentWithReplies, PublicCommentPage } from './types';

/*
 * Leituras de comentários.
 *
 *  - Página PÚBLICA de uma sessão pública: cliente sem cookies, `unstable_cache` com a tag
 *    `comments:<sessionId>`. UMA consulta traz os 20 comentários de nível superior, o autor (nome e papel,
 *    `profiles` é de leitura pública) e as respostas embutidas; mais uma contagem, em paralelo.
 *  - Sessão "só para membros" e os PENDENTES do próprio autor: cliente com cookies, sem cache, e
 *    mesclados no servidor (`threads.ts`). Nenhum dado de uma pessoa entra no cache compartilhado.
 *
 * O filtro `status = 'approved'` é SEMPRE explícito: a equipe lê todos os estados pelo RLS, então uma
 * consulta sem o filtro mostraria comentário pendente ou removido para quem é da equipe.
 *
 * Nome e papel do autor vêm junto e ficam no cache: uma mudança de nome ou papel aparece em até 5
 * minutos (a rede de segurança), porque a tag é por sessão e não por autor.
 */

const SAFETY_NET_SECONDS = 300;

type Client = SupabaseClient<Database>;

type AuthorEmbed = { display_name: string; role: string } | null;
type CommentRow = {
  id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  read_up_to: number | null;
  spoiler_up_to: number | null;
  status: string;
  created_at: string;
  author: AuthorEmbed;
};
type TopRow = CommentRow & { replies: CommentRow[] | null };

const COMMENT_COLUMNS =
  'id, parent_id, author_id, body, read_up_to, spoiler_up_to, status, created_at, author:profiles!comments_author_id_fkey(display_name, role)';
const TOP_COLUMNS = `${COMMENT_COLUMNS}, replies:comments!parent_id(${COMMENT_COLUMNS})`;

export function toCommentRecord(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    parentId: row.parent_id,
    authorId: row.author_id,
    authorName: row.author?.display_name ?? 'Leitor',
    authorRole: parseRole(row.author?.role),
    body: row.body,
    readUpTo: row.read_up_to,
    spoilerUpTo: row.spoiler_up_to,
    status: row.status === 'pending' ? 'pending' : 'approved',
    createdAt: row.created_at,
  };
}

/** Uma página de comentários aprovados de nível superior, com respostas aprovadas, mais o total. */
async function fetchApprovedPage(
  client: Client,
  sessionId: string,
  order: CommentOrder,
  cursor: CommentCursor | null,
): Promise<PublicCommentPage> {
  // O cursor vai dentro de um filtro `or=(…)`: só passa se for exatamente um timestamp e um uuid.
  const safeCursor = cursor === null ? null : parseCursor(cursor);
  if (cursor !== null && safeCursor === null) throw new Error('invalid_comment_cursor');

  const ascending = order === 'antigos';
  let query = client
    .from('comments')
    .select(TOP_COLUMNS)
    .eq('session_id', sessionId)
    .is('parent_id', null)
    .eq('status', 'approved')
    .eq('replies.status', 'approved')
    .order('created_at', { ascending })
    .order('id', { ascending })
    .order('created_at', { referencedTable: 'replies', ascending: true })
    .order('id', { referencedTable: 'replies', ascending: true })
    .limit(REPLIES_LIMIT + 1, { referencedTable: 'replies' })
    .limit(COMMENTS_PAGE_SIZE + 1);

  if (safeCursor) {
    const op = ascending ? 'gt' : 'lt';
    const { createdAt, id } = safeCursor;
    query = query.or(
      `created_at.${op}.${createdAt},and(created_at.eq.${createdAt},id.${op}.${id})`,
    );
  }

  const [pageResult, totalResult] = await Promise.all([
    query,
    client
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'approved'),
  ]);
  if (pageResult.error) throw pageResult.error;
  if (totalResult.error) throw totalResult.error;

  const rows = (pageResult.data ?? []) as unknown as TopRow[];
  const hasMore = rows.length > COMMENTS_PAGE_SIZE;
  const items = rows.slice(0, COMMENTS_PAGE_SIZE).map((row): CommentWithReplies => {
    const replies = (row.replies ?? []).map(toCommentRecord);
    return {
      ...toCommentRecord(row),
      replies: replies.slice(0, REPLIES_LIMIT),
      repliesTruncated: replies.length > REPLIES_LIMIT,
    };
  });
  return { items, hasMore, total: totalResult.count ?? 0 };
}

/** Página pública (sessão pública), do cache compartilhado. */
export function getPublicCommentPage(
  sessionId: string,
  order: CommentOrder,
  cursor: CommentCursor | null,
): Promise<PublicCommentPage> {
  return unstable_cache(
    () => fetchApprovedPage(createPublicClient(), sessionId, order, cursor),
    ['public:comments', sessionId, order, cursor?.createdAt ?? '', cursor?.id ?? ''],
    { tags: [commentsTag(sessionId)], revalidate: SAFETY_NET_SECONDS },
  )();
}

/** Página de uma sessão "só para membros": com a sessão de quem pede, sem cache. */
export async function getMemberCommentPage(
  sessionId: string,
  order: CommentOrder,
  cursor: CommentCursor | null,
): Promise<PublicCommentPage> {
  return fetchApprovedPage(await createClient(), sessionId, order, cursor);
}

/** Os comentários pendentes que ESTA pessoa escreveu nesta sessão (nível superior e respostas). */
export async function getOwnPendingComments(
  sessionId: string,
  userId: string,
): Promise<CommentRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('session_id', sessionId)
    .eq('author_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as unknown as CommentRow[]).map(toCommentRecord);
}

export type DiscussionPage = {
  items: CommentWithReplies[];
  nextCursor: CommentCursor | null;
  /** Comentários aprovados da sessão (o "Discussão N"). */
  total: number;
};

/**
 * A página de uma sessão para quem está vendo: aprovados (cache compartilhado se a sessão é pública;
 * com a sessão da pessoa se é só para membros) e os pendentes dela, em paralelo, mesclados.
 */
export async function loadDiscussionPage(input: {
  sessionId: string;
  membersOnly: boolean;
  viewerId: string | null;
  order: CommentOrder;
  cursor: CommentCursor | null;
}): Promise<DiscussionPage> {
  const { sessionId, membersOnly, viewerId, order, cursor } = input;
  const [page, ownPending] = await Promise.all([
    membersOnly
      ? getMemberCommentPage(sessionId, order, cursor)
      : getPublicCommentPage(sessionId, order, cursor),
    viewerId ? getOwnPendingComments(sessionId, viewerId) : Promise.resolve([]),
  ]);
  const items = mergeThread({
    page: page.items,
    hasMore: page.hasMore,
    ownPending,
    order,
    after: cursor,
  });
  return { items, nextCursor: nextCursor(page.items, page.hasMore), total: page.total };
}
