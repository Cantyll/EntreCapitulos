import type { Route } from 'next';
import Link from 'next/link';

import { SITE_NAME } from '@/lib/brand';
import { cx } from '@/lib/cx';

import styles from './Logo.module.css';

type LogoProps = {
  href?: Route;
  size?: 'sm' | 'md';
  className?: string;
};

export function Logo({ href = '/', size = 'md', className }: LogoProps) {
  return (
    <Link href={href} className={cx(styles.logo, size === 'sm' && styles.sm, className)}>
      <svg viewBox="0 0 16 22" aria-hidden="true" focusable="false">
        <path d="M1 0h14v21l-7-5-7 5z" fill="var(--rose)" />
        <path d="M4 0v14" stroke="var(--rose-deep)" strokeWidth="1.2" opacity=".35" />
      </svg>
      {SITE_NAME}
    </Link>
  );
}
