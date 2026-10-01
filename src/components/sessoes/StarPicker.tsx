'use client';

import { formatRating } from '@/components/livros/RatingSelect';
import { Button } from '@/components/ui/Button';

import styles from './sessoes.module.css';

/**
 * Nota de 0,5 a 5 em 10 passos. É um campo `range` nativo: setas do teclado, toque e leitor de
 * tela funcionam sem código extra. `null` = sem nota (a nota é opcional).
 */
export function StarPicker({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  const label = value === null ? 'Sem nota' : `${formatRating(value)} de 5`;
  return (
    <div className={styles.stars}>
      <div className={styles.starGlyphs} aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            data-fill={
              value !== null && value >= i
                ? 'full'
                : value !== null && value >= i - 0.5
                  ? 'half'
                  : 'none'
            }
          >
            ★
          </span>
        ))}
      </div>
      <input
        type="range"
        className={styles.range}
        min={0.5}
        max={5}
        step={0.5}
        value={value ?? 0.5}
        disabled={disabled}
        aria-label="Impressão até aqui"
        aria-valuetext={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className={styles.rowActions}>
        <output className={styles.muted}>{label}</output>
        {value !== null && (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
            Sem nota
          </Button>
        )}
      </div>
    </div>
  );
}
