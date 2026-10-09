'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * O comentário que a pessoa acabou de publicar nesta página. O formulário (o de comentário ou o de resposta)
 * informa o id que o servidor devolveu, e a lista marca esse comentário com o marca-texto quando ele aparece: depois
 * de publicar, o olho acha onde o texto foi parar. Só na memória da página.
 */
type PostedComment = { postedId: string | null; markPosted: (id: string) => void };

const PostedCommentContext = createContext<PostedComment>({
  postedId: null,
  markPosted: () => {},
});

export function PostedCommentProvider({ children }: { children: ReactNode }) {
  const [postedId, setPostedId] = useState<string | null>(null);
  const value = useMemo(() => ({ postedId, markPosted: setPostedId }), [postedId]);
  return <PostedCommentContext value={value}>{children}</PostedCommentContext>;
}

export function usePostedComment() {
  return useContext(PostedCommentContext);
}
