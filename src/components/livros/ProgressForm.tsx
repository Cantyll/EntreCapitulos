'use client';

import { useActionState } from 'react';

import { updateProgress } from '@/app/painel/livros/actions';
import { Button } from '@/components/ui/Button';
import { IDLE_BOOK_STATE, type BookActionState } from '@/lib/books/action-state';

import styles from './books.module.css';
import { FieldError, StatusNote } from './StatusNote';

export function ProgressForm({
  bookId,
  currentChapter,
  totalChapters,
}: {
  bookId: string;
  currentChapter: number;
  totalChapters: number;
}) {
  const [state, action, pending] = useActionState<BookActionState, FormData>(
    updateProgress,
    IDLE_BOOK_STATE,
  );
  // O select de "Capítulo atual" vai de 0 até o total; se o total foi estimado a mais, o que sobrar fica de fora.
  const max = Math.max(totalChapters, currentChapter);

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="bookId" value={bookId} />
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor="capitulo-atual">Capítulo atual</label>
          <select
            id="capitulo-atual"
            name="current_chapter"
            defaultValue={currentChapter}
            className={styles.select}
            aria-describedby="capitulo-atual-erro"
          >
            {Array.from({ length: max + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? '0 (ainda não comecei)' : n}
              </option>
            ))}
          </select>
          <FieldError id="capitulo-atual-erro" message={state.errors?.current_chapter} />
        </div>
        <div className={styles.field}>
          <label htmlFor="total-capitulos">Total de capítulos</label>
          <input
            id="total-capitulos"
            name="total_chapters"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            defaultValue={totalChapters}
            className={styles.input}
            aria-describedby="total-capitulos-dica total-capitulos-erro"
          />
          <small id="total-capitulos-dica">
            Uma estimativa: pode mudar quando você souber o número certo.
          </small>
          <FieldError id="total-capitulos-erro" message={state.errors?.total_chapters} />
        </div>
      </div>
      <StatusNote state={state} />
      <div className={styles.actions}>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar progresso'}
        </Button>
      </div>
    </form>
  );
}
