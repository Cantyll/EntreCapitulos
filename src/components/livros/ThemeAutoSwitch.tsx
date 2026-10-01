'use client';

import { useActionState } from 'react';

import { setThemeAuto } from '@/app/painel/livros/actions';
import { IDLE_BOOK_STATE, type BookActionState } from '@/lib/books/action-state';

import styles from './books.module.css';
import { StatusNote } from './StatusNote';

/** Interruptor "Tema automático pela capa": um formulário com botão role="switch". */
export function ThemeAutoSwitch({ bookId, enabled }: { bookId: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<BookActionState, FormData>(
    setThemeAuto,
    IDLE_BOOK_STATE,
  );
  return (
    <form action={action}>
      <input type="hidden" name="bookId" value={bookId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <button
        type="submit"
        role="switch"
        aria-checked={enabled}
        aria-label="Tema automático pela capa"
        className={styles.switch}
        disabled={pending}
      />
      <StatusNote state={state} />
    </form>
  );
}
