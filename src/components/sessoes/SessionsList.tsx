import Link from 'next/link';

import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { ADMIN_NEW_SESSION_HREF, ADMIN_SESSIONS_HREF } from '@/lib/routes';
import type { SessionListItem } from '@/lib/sessions/queries';

import { SessionRowActions } from './SessionRowActions';
import styles from './sessoes.module.css';

export type SessionFilter = 'todas' | 'publicadas' | 'rascunhos';

export const FILTERS: { key: SessionFilter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'publicadas', label: 'Publicadas' },
  { key: 'rascunhos', label: 'Rascunhos' },
];

export function parseFilter(value: string | undefined): SessionFilter {
  return value === 'publicadas' || value === 'rascunhos' ? value : 'todas';
}

/** Data de hoje no Brasil: o `timestamptz` do banco mostrado só como data, nunca usado como token. */
function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '–'
    : date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const chapters = (s: SessionListItem) =>
  s.chapterFrom === s.chapterTo ? `${s.chapterFrom}` : `${s.chapterFrom} a ${s.chapterTo}`;

function filterHref(key: SessionFilter) {
  return (key === 'todas' ? ADMIN_SESSIONS_HREF : `${ADMIN_SESSIONS_HREF}?filtro=${key}`) as never;
}

export function SessionsList({
  sessions,
  filter,
}: {
  sessions: SessionListItem[];
  filter: SessionFilter;
}) {
  const counts = {
    todas: sessions.length,
    publicadas: sessions.filter((s) => s.status === 'published').length,
    rascunhos: sessions.filter((s) => s.status === 'draft').length,
  };
  const shown = sessions.filter(
    (s) =>
      filter === 'todas' ||
      (filter === 'publicadas' ? s.status === 'published' : s.status === 'draft'),
  );

  return (
    <>
      <div className={styles.toolbarRow}>
        <nav className={styles.seg} aria-label="Filtrar sessões" data-tour="sessions-filters">
          {FILTERS.map(({ key, label }) => (
            <Link
              key={key}
              href={filterHref(key)}
              aria-current={filter === key ? 'page' : undefined}
              className={styles.filterLink}
            >
              {label} {counts[key]}
            </Link>
          ))}
        </nav>
        <ButtonLink href={ADMIN_NEW_SESSION_HREF} size="sm" data-tour="sessions-new">
          <Icon name="plus" size="sm" /> Nova sessão
        </ButtonLink>
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty} data-tour="sessions-list">
          {sessions.length === 0
            ? 'Nenhuma sessão ainda. Use “Nova sessão” para escrever a primeira.'
            : 'Nenhuma sessão neste filtro.'}
        </p>
      ) : (
        <div className={styles.listArea}>
          <div className={styles.tableWrap} data-tour="sessions-list">
            <table className={styles.table}>
              <caption>
                <VisuallyHidden>Sessões de leitura</VisuallyHidden>
              </caption>
              <thead>
                <tr>
                  <th scope="col">Sessão</th>
                  <th scope="col">Capítulos</th>
                  <th scope="col">Status</th>
                  <th scope="col">Comentários</th>
                  <th scope="col">Data</th>
                  <th scope="col">
                    <VisuallyHidden>Ações</VisuallyHidden>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className={styles.tTitle}>
                        <b>{s.title}</b>
                        <small>
                          Sessão {s.number}, {s.bookTitle}
                        </small>
                      </div>
                    </td>
                    <td>
                      <span className={styles.chapterChip}>{chapters(s)}</span>
                    </td>
                    <td>
                      <span
                        className={`${styles.pill} ${s.status === 'published' ? styles.pillOk : styles.pillDraft}`}
                      >
                        {s.status === 'published' ? 'Publicada' : 'Rascunho'}
                      </span>
                    </td>
                    <td>{s.status === 'published' ? s.commentCount : '–'}</td>
                    <td className={styles.muted}>{formatDay(s.date)}</td>
                    <td>
                      <SessionRowActions session={s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            className={styles.cards}
            style={{ listStyle: 'none', padding: 0, margin: 0 }}
            data-tour="sessions-list"
          >
            {shown.map((s) => (
              <li key={s.id} className={styles.sessionCard}>
                <b>{s.title}</b>
                <div className={styles.cardMeta}>
                  <span>
                    Sessão {s.number}, {s.bookTitle}
                  </span>
                  <span className={styles.chapterChip}>Capítulos {chapters(s)}</span>
                  <span
                    className={`${styles.pill} ${s.status === 'published' ? styles.pillOk : styles.pillDraft}`}
                  >
                    {s.status === 'published' ? 'Publicada' : 'Rascunho'}
                  </span>
                  {s.status === 'published' && (
                    <span>
                      {s.commentCount} {s.commentCount === 1 ? 'comentário' : 'comentários'}
                    </span>
                  )}
                  <span>{formatDay(s.date)}</span>
                </div>
                <SessionRowActions session={s} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
