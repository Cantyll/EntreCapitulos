import styles from './books.module.css';

const OPTIONS = Array.from({ length: 11 }, (_, i) => i / 2);

export const formatRating = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Nota de 0 a 5 em passos de 0,5. */
export function RatingSelect({
  id,
  name = 'rating',
  defaultValue = '',
  invalid,
  describedBy,
}: {
  id: string;
  name?: string;
  defaultValue?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      className={`${styles.select} ${invalid ? styles.invalid : ''}`}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      required
    >
      <option value="" disabled>
        Escolha a nota
      </option>
      {OPTIONS.map((n) => (
        <option key={n} value={n}>
          {formatRating(n)} de 5
        </option>
      ))}
    </select>
  );
}
