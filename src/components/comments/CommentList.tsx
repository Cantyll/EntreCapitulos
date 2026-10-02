'use client';

import { useState, useTransition } from 'react';

import { loadMoreComments } from '@/app/(public)/comment-actions';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { isCommentCovered, type CommentCursor, type CommentOrder } from '@/lib/comments';
import { countCovered, type DisplayComment } from '@/lib/comments/display';

import { CommentThread, type ReplyContext } from './CommentItem';
import styles from './comments.module.css';

type Props = {
  sessionId: string;
  order: CommentOrder;
  initialItems: DisplayComment[];
  initialCursor: CommentCursor | null;
  progress: number;
  progressKnown: boolean;
  reply: ReplyContext;
};

/**
 * A lista de conversas. A primeira página vem do servidor; "Carregar mais" busca as seguintes pelo cursor
 * e as junta aqui. Quando a primeira página muda (comentário novo desloca as páginas), as seguintes já
 * carregadas saem: o cursor delas deixaria de bater. Mudar o progresso NÃO descarta nada: só a cobertura
 * muda, porque ela é calculada aqui, com o progresso do momento.
 */
export function CommentList({
  sessionId,
  order,
  initialItems,
  initialCursor,
  progress,
  progressKnown,
  reply,
}: Props) {
  const signature = `${initialItems.map((item) => item.id).join(',')}|${initialCursor?.id ?? ''}`;
  const [loaded, setLoaded] = useState({
    signature,
    extra: [] as DisplayComment[],
    cursor: initialCursor,
  });
  if (loaded.signature !== signature) {
    setLoaded({ signature, extra: [], cursor: initialCursor });
  }
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState('');

  const seen = new Set(initialItems.map((item) => item.id));
  const all = [...initialItems, ...loaded.extra.filter((item) => !seen.has(item.id))];
  const hiddenCount = countCovered(all, (comment) =>
    isCommentCovered({ spoilerUpTo: comment.spoilerUpTo, progress, isAuthor: comment.isOwn }),
  );

  const loadMore = () => {
    const cursor = loaded.cursor;
    if (!cursor) return;
    setError('');
    startLoading(async () => {
      const result = await loadMoreComments(sessionId, order, cursor);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLoaded((current) => ({
        ...current,
        extra: [...current.extra, ...result.items],
        cursor: result.nextCursor,
      }));
    });
  };

  return (
    <>
      {hiddenCount > 0 && (
        <p className={styles.hint}>
          <Icon name="eyeOff" size="sm" />
          <span>
            {hiddenCount} {hiddenCount > 1 ? 'comentários falam' : 'comentário fala'} de capítulos{' '}
            {progressKnown ? `depois do ${progress}` : 'que você ainda não marcou como lidos'}.{' '}
            {hiddenCount > 1 ? 'Estão escondidos' : 'Está escondido'} até você mostrar.
          </span>
        </p>
      )}

      {all.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="chat" />
          <b>Ninguém comentou ainda</b>
          Seja a primeira pessoa a puxar a conversa.
        </div>
      ) : (
        <ul className={styles.list}>
          {all.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              progress={progress}
              progressKnown={progressKnown}
              reply={reply}
            />
          ))}
        </ul>
      )}

      {loaded.cursor && (
        <div className={styles.more}>
          <Button
            variant="ghost"
            onClick={loadMore}
            disabled={loading}
            aria-busy={loading || undefined}
          >
            {loading ? 'Carregando…' : 'Carregar mais comentários'}
          </Button>
          {error && (
            <p role="alert" className={styles.formError}>
              {error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
