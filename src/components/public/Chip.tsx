import type { ReactNode } from 'react';

import styles from './Chip.module.css';

/** Pílula do protótipo (.chip e .chip-line): "Sessão 4", "Capítulos 10 a 12", "Só membros". */
export function Chip({ line, children }: { line?: boolean; children: ReactNode }) {
  return <span className={line ? `${styles.chip} ${styles.line}` : styles.chip}>{children}</span>;
}
