import type { Route } from 'next';
import type { ReactNode } from 'react';

import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

import styles from './ForbiddenNotice.module.css';

type ForbiddenNoticeProps = {
  title: string;
  children: ReactNode;
  actions: { href: Route; label: string; variant?: 'primary' | 'ghost' }[];
};

/** Conteúdo das páginas 403 (`forbidden.tsx`). */
export function ForbiddenNotice({ title, children, actions }: ForbiddenNoticeProps) {
  return (
    <div className={styles.box}>
      <span className={styles.icon}>
        <Icon name="shield" size="lg" />
      </span>
      <p className={styles.code}>Erro 403</p>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.text}>{children}</div>
      <div className={styles.actions}>
        {actions.map((action) => (
          <ButtonLink key={action.href} href={action.href} variant={action.variant ?? 'primary'}>
            {action.label}
          </ButtonLink>
        ))}
      </div>
    </div>
  );
}
