/*
 * Formas dos comentários que as páginas usam. Objetos simples (texto, número, booleano): o
 * `unstable_cache` guarda tudo como JSON, então nada aqui é `Date`, `Map` ou classe.
 */

export type CommentRole = 'admin' | 'moderator' | 'member';

export type CommentRecord = {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  authorRole: CommentRole;
  body: string;
  /** Até que capítulo a pessoa tinha lido quando comentou; `null` ou 0 = não se sabe. */
  readUpTo: number | null;
  spoilerUpTo: number | null;
  /** Na página pública só chegam `approved` e, para o próprio autor, `pending`. */
  status: 'approved' | 'pending';
  /** `timestamptz` como TEXTO OPACO (microssegundos): nunca vira `Date` para comparar. */
  createdAt: string;
};

export type CommentWithReplies = CommentRecord & {
  replies: CommentRecord[];
  /** Há mais respostas do que `REPLIES_LIMIT`: a página avisa em vez de cortar em silêncio. */
  repliesTruncated: boolean;
};

/** Uma página pública (cacheável): só comentários aprovados. */
export type PublicCommentPage = {
  items: CommentWithReplies[];
  hasMore: boolean;
  /** Todos os comentários aprovados da sessão (níveis superior e resposta). */
  total: number;
};
