'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cx } from '@/lib/cx';
import { getPublicNav } from '@/lib/navigation';

import styles from './SiteNav.module.css';

export function SiteNav({ currentBookSlug }: { currentBookSlug: string | null }) {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Principal">
      {getPublicNav({ currentBookSlug }).map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cx(styles.link, active && styles.on)}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
