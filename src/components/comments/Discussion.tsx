import Link from 'next/link';

import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { ProgressSelect } from '@/components/public/ProgressSelect';
import type { CurrentUser } from '@/lib/auth/session';
import { signInPath } from '@/lib/auth/safe-next';
import { COMMENT_MESSAGES, spoilerChoices, type CommentOrder } from '@/lib/comments';
import { toDisplayThread } from '@/lib/comments/display';
import { loadDiscussionPage } from '@/lib/comments/queries';
import { isOwnCommentsSuspended } from '@/lib/members/own-suspension';
import { sessionHref } from '@/lib/routes';
import { effectiveProgress } from '@/lib/spoiler';
import { blocksCommenting } from '@/lib/terms';
import { getTermsStatus } from '@/lib/terms/server';

import { CommentForm } from './CommentForm';
import { CommentList } from './CommentList';
import { CommentSort } from './CommentSort';
import { PostedCommentProvider } from './PostedComment';
import { RetractNoticeProvider } from './RetractNotice';
import styles from './comments.module.css';

type Props = {
  sessionId: string;
  bookSlug: string;
  sessionNumber: number;
  membersOnly: boolean;
  commentsOpen: boolean;
  chapterFrom: number;
  chapterTo: number;
  totalChapters: number;
  progress: number | null;
  viewer: CurrentUser | null;
  order: CommentOrder;
};

/**
 * A discussão da sessão (Server Component): cabeçalho com "Li até o" e a ordem, o compositor (ou o convite
 * certo para quem não pode comentar) e a lista. Os dados da lista vêm de `loadDiscussionPage`: aprovados
 * do cache compartilhado (ou da sessão da pessoa, se a sessão é só para membros) mais os pendentes dela.
 */
export async function Discussion({
  sessionId,
  bookSlug,
  sessionNumber,
  membersOnly,
  commentsOpen,
  chapterFrom,
  chapterTo,
  totalChapters,
  progress,
  viewer,
  order,
}: Props) {
  const page = await loadDiscussionPage({
    sessionId,
    membersOnly,
    viewerId: viewer?.id ?? null,
    order,
    cursor: null,
  });
  const items = toDisplayThread(page.items, viewer?.id ?? null, new Date());

  const here = sessionHref(bookSlug, sessionNumber);
  const choices = spoilerChoices(chapterTo, totalChapters);
  // Quem está com os comentários suspensos (etapa 8f) vê um aviso no lugar do campo. A equipe nunca é suspensa,
  // então nem se consulta. Falha na leitura vale como "não suspenso": o banco recusa de qualquer jeito.
  // Quem nunca aceitou os Termos (etapa 8g; a equipe é isenta) vê o convite para aceitar. Falha na leitura vale
  // como "aceitou": o banco recusa de qualquer jeito (`terms_not_accepted:`) e o formulário mostra o motivo.
  const checkMember =
    commentsOpen && viewer !== null && viewer.nameConfirmed && viewer.role === 'member';
  const [suspended, termsStatus] = await Promise.all([
    checkMember && viewer ? isOwnCommentsSuspended(viewer.id) : false,
    checkMember && viewer ? getTermsStatus(viewer.id) : ('unknown' as const),
  ]);
  const termsBlocked = viewer !== null && blocksCommenting(viewer.role, termsStatus);
  const canComment =
    commentsOpen && viewer !== null && viewer.nameConfirmed && !suspended && !termsBlocked;
  const welcomeHref = `/boas-vindas?next=${encodeURIComponent(here)}`;

  return (
    <PostedCommentProvider>
      <section id="discussao" className={styles.disc} aria-labelledby="discussao-titulo">
        <div className={styles.discHead}>
          <h2 id="discussao-titulo" className={styles.discTitle}>
            Discussão <span className={styles.discCount}>{page.total}</span>
          </h2>
          <div className={styles.discControls}>
            <ProgressSelect bookSlug={bookSlug} total={totalChapters} progress={progress} />
            <CommentSort order={order} basePath={here} />
          </div>
        </div>

        {!commentsOpen ? (
          <p className={styles.notice} role="note">
            Os comentários desta sessão estão fechados.{' '}
            {page.total > 0 ? 'A conversa que já aconteceu continua aqui embaixo.' : ''}
          </p>
        ) : viewer === null ? (
          <div className={`${styles.card} ${styles.guest}`}>
            <p>Entre para comentar e responder às sessões.</p>
            <ButtonLink href={signInPath(here) as never} size="sm">
              Entrar para comentar
            </ButtonLink>
          </div>
        ) : !viewer.nameConfirmed ? (
          <div className={`${styles.card} ${styles.guest}`}>
            <p>Falta escolher o nome que aparece nos seus comentários.</p>
            <ButtonLink href={welcomeHref as never} size="sm">
              Escolher meu nome
            </ButtonLink>
          </div>
        ) : termsBlocked ? (
          // O banco recusa o comentário de quem nunca aceitou os Termos (a equipe é isenta): aqui só se convida.
          <div className={`${styles.card} ${styles.guest}`} data-terms-required>
            <p role="note">{COMMENT_MESSAGES.terms_not_accepted}</p>
            <ButtonLink href={welcomeHref as never} size="sm">
              Aceitar os Termos
            </ButtonLink>
          </div>
        ) : suspended ? (
          <div className={`${styles.card} ${styles.guest}`} data-comments-suspended>
            <p role="note">
              {COMMENT_MESSAGES.comments_suspended}{' '}
              <Link href="/privacidade#quem-controla">Ver o e-mail de contato</Link>
            </p>
          </div>
        ) : (
          <div className={`${styles.card} ${styles.composer}`}>
            <Avatar name={viewer.displayName} />
            <CommentForm
              sessionId={sessionId}
              spoilerChoices={choices}
              chapterTo={chapterTo}
              welcomeHref={welcomeHref}
              placeholder={`O que você achou dos capítulos ${chapterFrom} a ${chapterTo}?`}
              label="Seu comentário"
              submitLabel="Publicar comentário"
            />
          </div>
        )}

        <RetractNoticeProvider>
          <CommentList
            key={order}
            sessionId={sessionId}
            order={order}
            initialItems={items}
            initialCursor={page.nextCursor}
            progress={effectiveProgress(progress)}
            progressKnown={progress !== null}
            reply={{
              sessionId,
              chapterTo,
              spoilerChoices: choices,
              welcomeHref,
              canReply: canComment,
            }}
          />
        </RetractNoticeProvider>
      </section>
    </PostedCommentProvider>
  );
}
