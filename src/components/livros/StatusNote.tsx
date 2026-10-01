import type { BookActionState } from '@/lib/books/action-state';

import styles from './books.module.css';

/** Aviso do resultado de uma ação: erro em role="alert", sucesso em role="status". */
export function StatusNote({ state }: { state: BookActionState }) {
  if (state.status === 'idle' || !state.message) return null;
  return (
    <p
      role={state.status === 'error' ? 'alert' : 'status'}
      className={state.status === 'error' ? styles.error : styles.ok}
    >
      {state.message}
    </p>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span id={id} className={styles.fieldError}>
      {message}
    </span>
  ) : null;
}
