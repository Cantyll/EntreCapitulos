'use client';

import { useCallback, useId, useRef, useState } from 'react';

import { useReveal } from '@/components/public/useReveal';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { isCommentCovered } from '@/lib/comments';
import type { DisplayComment } from '@/lib/comments/display';

import { CommentForm } from './CommentForm';
import { RetractButton } from './RetractButton';
import styles from './comments.module.css';

export type ReplyContext = {
  sessionId: string;
  chapterTo: number;
  spoilerChoices: readonly number[];
  welcomeHref: string;
  /** Pode responder: sessão com comentários abertos e pessoa logada com o nome confirmado. */
  canReply: boolean;
};

type Props = {
  comment: DisplayComment;
  /** Quem escreveu o comentário de nível superior desta conversa (a resposta sempre vai para ele). */
  threadAuthor: string;
  progress: number;
  progressKnown: boolean;
  reply: ReplyContext;
  isReply?: boolean;
  onToggleReply?: () => void;
  /** Respostas de outras pessoas que somem junto com este comentário (só o de nível superior). */
  replyCount?: number;
};

const ROLE_BADGE = { admin: 'Autora', moderator: 'Moderadora' } as const;

/**
 * Um comentário (ou resposta). O texto é SEMPRE texto (`white-space: pre-wrap`, sem HTML e sem link
 * clicável). Coberto por spoiler: o texto continua no HTML, mas `inert`, `aria-hidden` e borrado, e o
 * botão para mostrar fica fora da área inerte, com `aria-expanded`. O autor nunca vê o próprio
 * comentário coberto.
 */
export function CommentBody({
  comment,
  progress,
  progressKnown,
}: {
  comment: DisplayComment;
  progress: number;
  progressKnown: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  const covered = isCommentCovered({
    spoilerUpTo: comment.spoilerUpTo,
    progress,
    isAuthor: comment.isOwn,
  });
  const focusBody = useCallback(() => bodyRef.current?.focus(), []);
  const { hidden, reveal } = useReveal(covered, progress, focusBody);

  if (comment.spoilerUpTo !== null && hidden) {
    return (
      <>
        <button
          type="button"
          className={styles.spoilerCover}
          aria-expanded={false}
          aria-controls={bodyId}
          onClick={reveal}
        >
          <Icon name="eyeOff" size="sm" />
          <span>
            Spoiler até o capítulo {comment.spoilerUpTo}.{' '}
            {progressKnown
              ? 'Toque para mostrar mesmo assim'
              : 'Você ainda não marcou até onde leu. Toque para mostrar'}
          </span>
        </button>
        <div
          id={bodyId}
          className={`${styles.body} ${styles.bodyCovered}`}
          inert
          aria-hidden="true"
        >
          {comment.body}
        </div>
      </>
    );
  }

  return (
    <div id={bodyId} ref={bodyRef} tabIndex={-1} className={styles.body}>
      {comment.spoilerUpTo !== null && (
        <span className={styles.spoilerTag}>spoiler do cap. {comment.spoilerUpTo}</span>
      )}
      {comment.body}
    </div>
  );
}

export function CommentArticle({
  comment,
  threadAuthor,
  progress,
  progressKnown,
  reply,
  isReply,
  onToggleReply,
  replyCount = 0,
}: Props) {
  const [deleted, setDeleted] = useState(false);
  const badge = comment.authorRole === 'member' ? null : ROLE_BADGE[comment.authorRole];

  if (deleted) {
    return (
      <article id={`comentario-${comment.id}`} className={isReply ? styles.reply : styles.comment}>
        <p role="status" className={styles.deleted}>
          Comentário excluído.
        </p>
      </article>
    );
  }

  const canReply = reply.canReply && !comment.pending && onToggleReply;

  return (
    <article id={`comentario-${comment.id}`} className={isReply ? styles.reply : styles.comment}>
      <Avatar name={comment.authorName} />
      <div className={styles.main}>
        <div className={styles.head}>
          <span className={styles.name}>{comment.authorName}</span>
          {badge && (
            <span className={comment.authorRole === 'admin' ? styles.badgeAuthor : styles.badgeMod}>
              {badge}
            </span>
          )}
          {comment.readUpTo !== null && (
            <span className={styles.readChip}>leu até o cap. {comment.readUpTo}</span>
          )}
          <time className={styles.time} dateTime={comment.createdAt}>
            {comment.timeText}
          </time>
          {comment.pending && <span className={styles.pending}>Em análise</span>}
        </div>

        <CommentBody comment={comment} progress={progress} progressKnown={progressKnown} />

        {(canReply || comment.isOwn) && (
          <div className={styles.actions}>
            {canReply && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={onToggleReply}
                aria-label={`Responder a ${threadAuthor}`}
              >
                <Icon name="reply" size="sm" />
                Responder
              </button>
            )}
            {comment.isOwn && (
              <RetractButton
                commentId={comment.id}
                replyCount={replyCount}
                onDeleted={() => setDeleted(true)}
              />
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** Uma conversa: o comentário de nível superior, as respostas e a caixa de resposta. */
export function CommentThread({
  comment,
  progress,
  progressKnown,
  reply,
}: {
  comment: DisplayComment;
  progress: number;
  progressKnown: boolean;
  reply: ReplyContext;
}) {
  const [replying, setReplying] = useState(false);
  const [notice, setNotice] = useState('');
  const toggle = useCallback(() => setReplying((open) => !open), []);
  const onPosted = useCallback((message: string) => {
    setReplying(false);
    setNotice(message);
  }, []);

  return (
    <li className={styles.thread}>
      <CommentArticle
        comment={comment}
        threadAuthor={comment.authorName}
        progress={progress}
        progressKnown={progressKnown}
        reply={reply}
        onToggleReply={toggle}
        replyCount={comment.replies.length}
      />
      {(comment.replies.length > 0 || replying || notice) && (
        <div className={styles.repliesBlock}>
          {comment.replies.length > 0 && (
            <ul className={styles.replies} aria-label={`Respostas a ${comment.authorName}`}>
              {comment.replies.map((item) => (
                <li key={item.id}>
                  <CommentArticle
                    comment={item}
                    threadAuthor={comment.authorName}
                    progress={progress}
                    progressKnown={progressKnown}
                    reply={reply}
                    isReply
                    onToggleReply={toggle}
                  />
                </li>
              ))}
            </ul>
          )}
          {comment.repliesTruncated && (
            <p className={styles.truncated}>Mostrando as 100 primeiras respostas.</p>
          )}
          {notice && !replying && (
            <p role="status" className={styles.formOk}>
              {notice}
            </p>
          )}
          {replying && (
            <div className={styles.replyBox}>
              <CommentForm
                sessionId={reply.sessionId}
                parentId={comment.id}
                spoilerChoices={reply.spoilerChoices}
                chapterTo={reply.chapterTo}
                welcomeHref={reply.welcomeHref}
                placeholder={`Responder a ${comment.authorName.split(' ')[0]}…`}
                label={`Sua resposta a ${comment.authorName}`}
                submitLabel="Responder"
                autoFocus
                onPosted={onPosted}
                onCancel={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
