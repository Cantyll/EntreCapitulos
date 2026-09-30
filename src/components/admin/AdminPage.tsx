import type { Route } from 'next';
import type { ReactNode } from 'react';

import { BackButton } from '@/components/ui/BackButton';

import styles from './AdminPage.module.css';

type AdminPageProps = {
  /** Páginas internas do painel: botão Voltar no topo. `href` é a página pai. */
  back?: { href: Route; label: string };
  children: ReactNode;
};

/** Corpo de uma página do painel. O título fica no topo (AdminTopbar), não aqui. */
export function AdminPage({ back, children }: AdminPageProps) {
  return (
    <div className={styles.page}>
      {back && <BackButton fallbackHref={back.href}>{back.label}</BackButton>}
      {children}
    </div>
  );
}
