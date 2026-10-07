'use client';

import Link from 'next/link';
import { useId, useState, useTransition } from 'react';

import {
  approveAsSpoiler,
  approveComment,
  approveUnflaggedOnPage,
  removeComment,
  restoreComment,
  setCommentSpoiler,
  type ModerationResult,
} from '@/app/painel/comentarios/actions';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ROLE_LABELS } from '@/lib/auth/roles';
import type { ModerationItem } from '@/lib/comments/admin-queries';
import { spoilerChoices, type ModerationTab } from '@/lib/comments';
import { sessionHref } from '@/lib/routes';

import styles from './moderation.module.css';

export type BoardItem = ModerationItem & { timeText: string; fullDate: string };

type Props = {
  items: BoardItem[];
  tab: ModerationTab;
  emptyText: string;
};

const ROLE_BADGE = { admin: ROLE_LABELS.admin, moderator: ROLE_LABELS.moderator } as const;

/**
 * A lista de moderação e o aviso do resultado das ações. Cada ação chama uma Server Action (que confere o
 * papel de novo) e a página é refeita com os dados novos; o aviso fica aqui, porque o item sai da aba.
 */
export function ModerationBoard({ items, tab, emptyText }: Props) {
  const [notice, setNotice] = useState<ModerationResult | null>(null);
  const [bulkPending, startBulk] = useTransition();

  const unflagged = items.filter((item) => item.flagReason === null);

  return (
    <>
      <div role="status" aria-live="polite" className={styles.noticeSlot}>
        {notice && (
          <p className={notice.ok ? styles.noticeOk : styles.noticeError}>{notice.message}</p>
        )}
      </div>

      {tab === 'pendentes' && unflagged.length > 0 && (
        <div className={styles.bulk} data-tour="comments-bulk">
          <Button
            variant="ghost"
            size="sm"
            disabled={bulkPending}
            aria-busy={bulkPending || undefined}
            onClick={() =>
              startBulk(async () => {
                setNotice(await approveUnflaggedOnPage(items.map((item) => item.id)));
              })
            }
          >
            <Icon name="check" size="sm" />
            {unflagged.length === 1
              ? 'Aprovar o 1 desta página sem alerta'
              : `Aprovar os ${unflagged.length} desta página sem alerta`}
          </Button>
          <small>Os que têm alerta ficam para você decidir um a um.</small>
        </div>
      )}

      {items.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="check" />
          <b>{emptyText}</b>
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <ModerationRow key={item.id} item={item} onResult={setNotice} />
          ))}
        </ul>
      )}
    </>
  );
}

function ModerationRow({
  item,
  onResult,
}: {
  item: BoardItem;
  onResult: (result: ModerationResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState<'approve' | 'mark' | null>(null);
  const choices = item.session
    ? spoilerChoices(item.session.chapterTo, item.session.totalChapters)
    : [];
  const [upTo, setUpTo] = useState(String(choices[0] ?? ''));
  const selectId = useId();

  const run = (action: () => Promise<ModerationResult>) =>
    startTransition(async () => {
      const result = await action();
      onResult(result);
      if (result.ok) setChoosing(null);
    });

  const badge = item.authorRole === 'member' ? null : ROLE_BADGE[item.authorRole];

  return (
    <li id={`moderar-${item.id}`} className={styles.item}>
      <Avatar name={item.authorName} />
      <div className={styles.main}>
        <div className={styles.head}>
          <span className={styles.name}>{item.authorName}</span>
          {badge && <span className={styles.badge}>{badge}</span>}
          <time className={styles.time} dateTime={item.createdAt} title={item.fullDate}>
            {item.timeText}
          </time>
          {item.isReply && <span className={styles.chip}>resposta</span>}
          {item.readUpTo !== null && (
            <span className={styles.chip}>leu até o cap. {item.readUpTo}</span>
          )}
          {item.spoilerUpTo !== null && (
            <span className={styles.spoilerTag}>spoiler do cap. {item.spoilerUpTo}</span>
          )}
        </div>

        {item.session && (
          <div className={styles.context}>
            na sessão {item.session.number}: {item.session.title}
          </div>
        )}
        {item.flagReason && (
          <span className={styles.flag}>
            <Icon name="flag" size="sm" />
            Alerta: {item.flagReason}
          </span>
        )}

        <div className={styles.body}>{item.body}</div>

        <div className={styles.actions}>
          {item.status === 'pending' && (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => approveComment(item.id))}
              >
                <Icon name="check" size="sm" />
                Aprovar
              </Button>
              {choices.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-expanded={choosing === 'approve'}
                  onClick={() => setChoosing(choosing === 'approve' ? null : 'approve')}
                >
                  <Icon name="eyeOff" size="sm" />
                  Aprovar como spoiler
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                danger
                disabled={pending}
                onClick={() => run(() => removeComment(item.id))}
              >
                <Icon name="trash" size="sm" />
                Remover
              </Button>
            </>
          )}

          {item.status === 'approved' && (
            <>
              {item.session && (
                <Link
                  className={styles.linkButton}
                  href={
                    `${sessionHref(item.session.bookSlug, item.session.number)}#comentario-${item.id}` as never
                  }
                >
                  <Icon name="eye" size="sm" />
                  Ver na sessão
                </Link>
              )}
              {item.spoilerUpTo !== null ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => setCommentSpoiler(item.id, null))}
                >
                  <Icon name="eyeOff" size="sm" />
                  Tirar spoiler
                </Button>
              ) : (
                choices.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    aria-expanded={choosing === 'mark'}
                    onClick={() => setChoosing(choosing === 'mark' ? null : 'mark')}
                  >
                    <Icon name="eyeOff" size="sm" />
                    Marcar como spoiler
                  </Button>
                )
              )}
              <Button
                size="sm"
                variant="ghost"
                danger
                disabled={pending}
                onClick={() => run(() => removeComment(item.id))}
              >
                <Icon name="trash" size="sm" />
                Remover
              </Button>
            </>
          )}

          {item.status === 'removed' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => restoreComment(item.id))}
            >
              Restaurar
            </Button>
          )}
        </div>

        {choosing && choices.length > 0 && (
          <div className={styles.picker}>
            <label htmlFor={selectId}>Fala de coisas até o capítulo</label>
            <select id={selectId} value={upTo} onChange={(event) => setUpTo(event.target.value)}>
              {choices.map((chapter) => (
                <option key={chapter} value={chapter}>
                  {chapter}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() =>
                  choosing === 'approve'
                    ? approveAsSpoiler(item.id, Number(upTo))
                    : setCommentSpoiler(item.id, Number(upTo)),
                )
              }
            >
              {choosing === 'approve' ? 'Aprovar com aviso' : 'Marcar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChoosing(null)}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
