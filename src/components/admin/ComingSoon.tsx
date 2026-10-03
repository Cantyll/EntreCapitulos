import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';

import styles from './ComingSoon.module.css';

/**
 * Bloco "Em breve" do painel: diz com franqueza que a área ainda não existe. Nunca mostra número,
 * nome ou texto de exemplo.
 */
export function ComingSoon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.box} aria-labelledby="em-breve-titulo">
      <span className={styles.badge}>
        <Icon name="clock" size="sm" />
        Em breve
      </span>
      <h2 id="em-breve-titulo">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
