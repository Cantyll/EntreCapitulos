import { ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { cx } from '@/lib/cx';

import styles from './members.module.css';

const ROLE_CLASS = {
  admin: styles.roleAdmin,
  moderator: styles.roleModerator,
  member: styles.roleMember,
} as const satisfies Record<Role, string | undefined>;

/** O cargo, com o rótulo neutro (ROLE_LABELS). */
export function RoleBadge({ role }: { role: Role }) {
  return <span className={cx(styles.role, ROLE_CLASS[role])}>{ROLE_LABELS[role]}</span>;
}

/** Situação dos comentários: Ativo, Suspenso ou, se não deu para ler a tabela, "Indisponível". */
export function StatusPill({ suspended }: { suspended: boolean | null }) {
  if (suspended === null) {
    return <span className={cx(styles.status, styles.statusUnknown)}>Indisponível</span>;
  }
  return suspended ? (
    <span className={cx(styles.status, styles.statusSuspended)}>Suspenso</span>
  ) : (
    <span className={cx(styles.status, styles.statusOk)}>Ativo</span>
  );
}
