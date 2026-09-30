import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

import styles from './Container.module.css';

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx(styles.wrap, className)}>{children}</div>;
}
