import Link from 'next/link';

import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { NEW_SESSION_HREF } from '@/lib/navigation';
import { adminProfile } from '@/lib/sample-data';

import { AdminNav } from './AdminNav';
import styles from './AdminSidebar.module.css';

/** Barra lateral do protótipo, para telas acima de 1020px. */
export function AdminSidebar({ pendingComments }: { pendingComments: number }) {
  return (
    <aside className={styles.side}>
      <div className={styles.brand}>
        <Logo size="sm" href="/painel" />
        <span className={styles.tag}>Painel</span>
      </div>
      <ButtonLink href={NEW_SESSION_HREF} className={styles.cta}>
        <Icon name="pen" size="sm" />
        Nova sessão
      </ButtonLink>
      <AdminNav pendingComments={pendingComments} />
      <hr className={styles.sep} />
      <div className={styles.foot}>
        <Link href="/" className={styles.siteLink}>
          <Icon name="eye" />
          Ver o site
        </Link>
        <div className={styles.me}>
          <Avatar name={adminProfile.name} size="sm" />
          <div>
            <b>{adminProfile.name}</b>
            <small>{adminProfile.role}</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
