import type { ReactNode } from 'react';

import styles from './VisuallyHidden.module.css';

/** Texto só para leitor de tela (ex.: "para aprovar" depois do contador de comentários). */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className={styles.hidden}>{children}</span>;
}
