import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { sessionHref } from '@/lib/routes';
import { formatDayMonth } from '@/lib/site';
import type { SessionSummary } from '@/lib/public/types';

import { Chip } from './Chip';
import styles from './SessionCard.module.css';

const chaptersText = (s: Pick<SessionSummary, 'chapterFrom' | 'chapterTo'>) =>
  s.chapterFrom === s.chapterTo
    ? `Capítulo ${s.chapterFrom}`
    : `Capítulos ${s.chapterFrom} a ${s.chapterTo}`;

export { chaptersText };

/**
 * Cartão de sessão (home, /sessoes). O título é o link e o cartão inteiro é clicável. Mostra só o que
 * existe: data, minutos de leitura e resumo aparecem se estiverem preenchidos.
 */
export function SessionCard({
  session,
  bookSlug,
  isNew,
}: {
  session: SessionSummary;
  bookSlug: string;
  isNew?: boolean;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.num} aria-hidden="true">
        <small>sessão</small>
        {String(session.number).padStart(2, '0')}
      </div>
      <div>
        <div className={styles.chips}>
          <Chip line>{chaptersText(session)}</Chip>
          {session.membersOnly && <Chip>Só membros</Chip>}
          {isNew && <Chip>Nova</Chip>}
        </div>
        <h3 className={styles.title}>
          <Link href={sessionHref(bookSlug, session.number)} className={styles.link}>
            <span className={styles.visually}>Sessão {session.number}: </span>
            {session.title}
          </Link>
        </h3>
        {session.excerpt && <p className={styles.excerpt}>{session.excerpt}</p>}
        <div className={styles.meta}>
          {session.publishedAt && (
            <span>
              <Icon name="calendar" size="sm" />
              {formatDayMonth(session.publishedAt)}
            </span>
          )}
          {session.readMinutes ? (
            <span>
              <Icon name="clock" size="sm" />
              {session.readMinutes} min de leitura
            </span>
          ) : null}
          {session.commentCount > 0 && (
            <span>
              <Icon name="chat" size="sm" />
              {session.commentCount} {session.commentCount === 1 ? 'comentário' : 'comentários'}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
