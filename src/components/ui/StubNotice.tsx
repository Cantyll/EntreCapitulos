import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

import { Icon } from './Icon';
import styles from './StubNotice.module.css';

/**
 * Aviso das páginas-esqueleto da Fase 0. Sai de cena quando a página ganha conteúdo de verdade.
 * `flush` tira a margem de cima (no painel ele abre a página, sem título acima).
 */
export function StubNotice({ children, flush }: { children: ReactNode; flush?: boolean }) {
  return (
    <div className={cx(styles.notice, flush && styles.flush)} role="note">
      <Icon name="spark" />
      <p>
        <b>Esqueleto da Fase 0.</b> {children}
      </p>
    </div>
  );
}
