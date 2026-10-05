import Link from 'next/link';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { adminMemberHref } from '@/lib/routes';

import styles from './members.module.css';
import { RoleBadge, StatusPill } from './RoleBadge';
import type { MemberListItem } from '@/lib/members/queries';

export type MemberRow = MemberListItem & {
  /** Data de entrada já formatada no servidor (fuso de Brasília). */
  joined: string;
  /** E-mail MASCARADO ("a***@dominio.com"), nunca o completo; `null` quando a coluna não existe. */
  maskedEmail: string | null;
};

/**
 * A lista, desenhada duas vezes: tabela no desktop e cartões no celular. O CSS esconde um deles com
 * `display:none`, então o leitor de tela e o teclado só veem UM conjunto de links. Cada pessoa tem um só link:
 * o nome, que abre o perfil.
 */
export function MembersList({
  rows,
  showEmail,
  emptyText,
}: {
  rows: readonly MemberRow[];
  showEmail: boolean;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <div className={styles.empty} data-tour="members-table">
        <Icon name="users" />
        <b>{emptyText}</b>
      </div>
    );
  }

  return (
    <div data-tour="members-table">
      <div className={styles.tableView}>
        <table className={styles.table}>
          <caption>
            <VisuallyHidden>Membros do clube</VisuallyHidden>
          </caption>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">Entrada</th>
              <th scope="col">Comentários aprovados</th>
              <th scope="col">Cargo</th>
              <th scope="col">Situação</th>
              {showEmail && <th scope="col">E-mail</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <span className={styles.person}>
                    <Avatar name={row.displayName} size="sm" />
                    <Link href={adminMemberHref(row.id)} className={styles.name}>
                      {row.displayName}
                    </Link>
                  </span>
                </th>
                <td className={styles.muted}>{row.joined}</td>
                <td className={styles.numeric}>{row.approvedCount}</td>
                <td>
                  <RoleBadge role={row.role} />
                </td>
                <td>
                  <StatusPill suspended={row.suspended} />
                </td>
                {showEmail && <td className={styles.masked}>{row.maskedEmail ?? '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={styles.cardsView} aria-label="Membros do clube">
        {rows.map((row) => (
          <li key={row.id} className={styles.cardItem}>
            <span className={styles.person}>
              <Avatar name={row.displayName} size="sm" />
              <Link href={adminMemberHref(row.id)} className={styles.name}>
                {row.displayName}
              </Link>
            </span>
            <dl className={styles.facts}>
              <dt>Entrada</dt>
              <dd>{row.joined}</dd>
              <dt>Aprovados</dt>
              <dd className={styles.numeric}>{row.approvedCount}</dd>
              <dt>Cargo</dt>
              <dd>
                <RoleBadge role={row.role} />
              </dd>
              <dt>Situação</dt>
              <dd>
                <StatusPill suspended={row.suspended} />
              </dd>
              {showEmail && (
                <>
                  <dt>E-mail</dt>
                  <dd className={styles.masked}>{row.maskedEmail ?? '—'}</dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
