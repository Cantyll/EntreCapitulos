import Link from 'next/link';

import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { signOut } from '@/lib/auth/actions';
import { ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { NEW_SESSION_HREF, canCreateSession } from '@/lib/navigation';

import { AdminNav } from './AdminNav';
import styles from './AdminSidebar.module.css';

type AdminSidebarProps = {
  role: Role;
  name: string;
  pendingComments: number;
};

/** Barra lateral do protótipo, para telas acima de 1020px. */
export function AdminSidebar({ role, name, pendingComments }: AdminSidebarProps) {
  return (
    <aside className={styles.side}>
      <div className={styles.brand}>
        <Logo size="sm" href="/painel" />
        <span className={styles.tag}>Painel</span>
      </div>
      {canCreateSession(role) && (
        <ButtonLink href={NEW_SESSION_HREF} className={styles.cta}>
          <Icon name="pen" size="sm" />
          Nova sessão
        </ButtonLink>
      )}
      <AdminNav role={role} pendingComments={pendingComments} />
      <hr className={styles.sep} />
      <div className={styles.foot}>
        <Link href="/" className={styles.siteLink}>
          <Icon name="eye" />
          Ver o site
        </Link>
        <form action={signOut}>
          <button type="submit" className={styles.siteLink}>
            <Icon name="logout" />
            Sair
          </button>
        </form>
        <div className={styles.me}>
          <Avatar name={name} size="sm" />
          <div>
            <b>{name}</b>
            <small>{ROLE_LABELS[role]}</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
