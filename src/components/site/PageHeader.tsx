import type { Route } from 'next';
import type { ReactNode } from 'react';

import { BackButton } from '@/components/ui/BackButton';
import { cx } from '@/lib/cx';

import styles from './PageHeader.module.css';

type PageHeaderProps = {
  title: string;
  /** Linha acima do título. Com `live`, ganha o ponto de "Lendo agora" do protótipo. */
  eyebrow?: string;
  live?: boolean;
  lead?: ReactNode;
  /** Páginas internas: botão Voltar no topo. `href` é a página pai. */
  back?: { href: Route; label: string };
};

export function PageHeader({ title, eyebrow, live, lead, back }: PageHeaderProps) {
  return (
    <header className={cx(styles.header, back && styles.hasBack)}>
      {back && (
        <div className={styles.back}>
          <BackButton fallbackHref={back.href}>{back.label}</BackButton>
        </div>
      )}
      {eyebrow && (
        <p className={cx(styles.eyebrow, live && styles.live)}>
          {live && <i aria-hidden="true" />}
          {eyebrow}
        </p>
      )}
      <h1>{title}</h1>
      {lead && <p className={styles.lead}>{lead}</p>}
    </header>
  );
}
