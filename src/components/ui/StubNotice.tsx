import type { ReactNode } from 'react';

import { Icon } from './Icon';
import styles from './StubNotice.module.css';

/** Aviso das páginas-esqueleto da Fase 0. Sai de cena quando a página ganha conteúdo de verdade. */
export function StubNotice({ children }: { children: ReactNode }) {
  return (
    <div className={styles.notice} role="note">
      <Icon name="spark" />
      <p>
        <b>Esqueleto da Fase 0.</b> {children}
      </p>
    </div>
  );
}
