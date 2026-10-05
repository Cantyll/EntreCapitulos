import Link from 'next/link';

import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { ROLE_LABELS, hasRole, type Role } from '@/lib/auth/roles';
import { NEW_SESSION_HREF } from '@/lib/navigation';

import { AdminNav } from './AdminNav';
import styles from './AdminSidebar.module.css';

/** Barra lateral do protótipo, para telas acima de 1020px. */
type AdminSidebarProps = { pendingComments: number; role: Role; displayName: string };

export function AdminSidebar({ pendingComments, role, displayName }: AdminSidebarProps) {
  return (
    <aside className={styles.side}>
      <div className={styles.brand}>
        <Logo size="sm" href="/painel" />
        <span className={styles.tag}>Painel</span>
      </div>
      {hasRole(role, 'admin') && (
        <ButtonLink href={NEW_SESSION_HREF} className={styles.cta}>
          <Icon name="pen" size="sm" />
          Nova sessão
        </ButtonLink>
      )}
      <AdminNav pendingComments={pendingComments} role={role} />
      <hr className={styles.sep} />
      <div className={styles.foot}>
        <Link href="/" className={styles.siteLink}>
          <Icon name="eye" />
          Ver o site
        </Link>
        <div className={styles.me}>
          <Avatar name={displayName} size="sm" />
          <div>
            <b>{displayName}</b>
            <small>{ROLE_LABELS[role]}</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
