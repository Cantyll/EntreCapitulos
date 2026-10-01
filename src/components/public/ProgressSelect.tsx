'use client';

import { useId, useOptimistic, useState, useTransition } from 'react';

import { setReadingProgress } from '@/app/(public)/progress-actions';

import styles from './ProgressSelect.module.css';

/**
 * "Li até o capítulo X": grava o progresso da pessoa neste livro (banco se estiver logada, cookie se
 * for visitante) e a página se refaz com o novo filtro de spoiler. `progress` é `null` quando ainda
 * não se sabe: o seletor começa em "Escolha" e nada é gravado até a pessoa escolher.
 */
export function ProgressSelect({
  bookSlug,
  total,
  progress,
  label = 'Li até o',
  className,
}: {
  bookSlug: string;
  total: number;
  progress: number | null;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [shown, setShown] = useOptimistic(progress);

  const options = Array.from({ length: total + 1 }, (_, chapter) => chapter);
  const optionLabel = (chapter: number) =>
    chapter === 0 ? 'Ainda não comecei' : chapter === total ? 'Li o livro todo' : `Capítulo ${chapter}`;

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        value={shown === null ? '' : String(shown)}
        disabled={pending}
        aria-busy={pending || undefined}
        onChange={(event) => {
          const chapter = Number(event.target.value);
          setError('');
          startTransition(async () => {
            setShown(chapter);
            const result = await setReadingProgress(bookSlug, chapter);
            if (!result.ok) setError(result.message);
          });
        }}
      >
        {shown === null && (
          <option value="" disabled>
            Escolha…
          </option>
        )}
        {options.map((chapter) => (
          <option key={chapter} value={chapter}>
            {optionLabel(chapter)}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
