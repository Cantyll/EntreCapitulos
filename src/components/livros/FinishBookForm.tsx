'use client';

import { useActionState, useRef } from 'react';

import { finishBook } from '@/app/painel/livros/actions';
import { Button } from '@/components/ui/Button';
import { IDLE_BOOK_STATE, type BookActionState } from '@/lib/books/action-state';

import styles from './books.module.css';
import { RatingSelect } from './RatingSelect';
import { FieldError, StatusNote } from './StatusNote';

/** "Marcar livro como terminado": pede a nota e confirma num diálogo. */
export function FinishBookForm({ bookId, title }: { bookId: string; title: string }) {
  const [state, action, pending] = useActionState<BookActionState, FormData>(
    finishBook,
    IDLE_BOOK_STATE,
  );
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button variant="soft" size="sm" onClick={() => dialog.current?.showModal()}>
        Marcar livro como terminado
      </Button>
      <StatusNote state={state} />
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="terminar-titulo">
        <form action={action} className={styles.formGrid}>
          <h3 id="terminar-titulo" className={styles.bookTitle}>
            Terminar “{title}”?
          </h3>
          <p className={styles.muted}>
            O livro vai para a estante com a nota que você escolher, e o site fica sem leitura atual
            até você começar outro da fila.
          </p>
          <input type="hidden" name="bookId" value={bookId} />
          <div className={styles.field}>
            <label htmlFor="terminar-nota">Nota do livro</label>
            <RatingSelect
              id="terminar-nota"
              invalid={Boolean(state.errors?.rating)}
              describedBy="terminar-nota-erro"
            />
            <FieldError id="terminar-nota-erro" message={state.errors?.rating} />
          </div>
          <div className={styles.actions}>
            <Button type="submit" disabled={pending}>
              {pending ? 'Salvando…' : 'Marcar como terminado'}
            </Button>
            <Button variant="ghost" onClick={() => dialog.current?.close()}>
              Cancelar
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
