'use client';

import { useActionState, useRef } from 'react';

import { deleteBook } from '@/app/painel/livros/actions';
import { Button } from '@/components/ui/Button';
import { IDLE_BOOK_STATE, type BookActionState } from '@/lib/books/action-state';

import styles from './books.module.css';
import { StatusNote } from './StatusNote';

/** Excluir livro: só sem sessões, depois de confirmar. Apaga também a capa do Storage. */
export function DeleteBookForm({
  bookId,
  title,
  sessionCount,
}: {
  bookId: string;
  title: string;
  sessionCount: number;
}) {
  const [state, action, pending] = useActionState<BookActionState, FormData>(
    deleteBook,
    IDLE_BOOK_STATE,
  );
  const dialog = useRef<HTMLDialogElement>(null);

  if (sessionCount > 0) {
    return (
      <p className={styles.note}>
        Este livro tem {sessionCount} {sessionCount === 1 ? 'sessão' : 'sessões'} e não pode ser
        excluído.
      </p>
    );
  }

  return (
    <div>
      <Button variant="ghost" danger onClick={() => dialog.current?.showModal()}>
        Excluir livro
      </Button>
      <StatusNote state={state} />
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="excluir-titulo">
        <form action={action} className={styles.formGrid}>
          <h3 id="excluir-titulo" className={styles.bookTitle}>
            Excluir “{title}”?
          </h3>
          <p className={styles.muted}>Isso apaga o livro e a capa dele. Não dá para desfazer.</p>
          <input type="hidden" name="bookId" value={bookId} />
          <div className={styles.actions}>
            <Button type="submit" variant="ghost" danger disabled={pending}>
              {pending ? 'Excluindo…' : 'Excluir de vez'}
            </Button>
            <Button variant="soft" onClick={() => dialog.current?.close()}>
              Cancelar
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
