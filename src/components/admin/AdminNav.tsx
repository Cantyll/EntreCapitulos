'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '@/components/ui/Icon';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { cx } from '@/lib/cx';
import type { Role } from '@/lib/auth/roles';
import { getAdminNavFor, isAdminNavActive } from '@/lib/navigation';

import styles from './AdminNav.module.css';

/** Menu da barra lateral (telas largas). No celular o painel usa a AdminTabBar. */
export function AdminNav({ pendingComments, role }: { pendingComments: number; role: Role }) {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Painel">
      {getAdminNavFor(role).map((item) => {
        const active = isAdminNavActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(styles.link, active && styles.on)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon name={item.icon} />
            {item.label}
            {item.pendingBadge && pendingComments > 0 && (
              <span className={styles.count}>
                {pendingComments}
                <VisuallyHidden> para aprovar</VisuallyHidden>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
