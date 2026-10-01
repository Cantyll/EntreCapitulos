import { formatRatingNumber } from '@/lib/site';

import styles from './Stars.module.css';

/**
 * Nota em estrelas (0 a 5, de meio em meio). O nome acessível diz a nota por extenso; as estrelas em
 * si são desenho. Com `showValue`, o número também aparece (nunca só a cor ou a forma).
 */
export function Stars({
  rating,
  showValue,
  className,
}: {
  rating: number;
  showValue?: boolean;
  className?: string;
}) {
  const label = `${formatRatingNumber(rating)} de 5 estrelas`;
  return (
    <span className={[styles.stars, className].filter(Boolean).join(' ')}>
      <span role="img" aria-label={label} className={styles.glyphs}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            data-fill={rating >= i ? 'full' : rating >= i - 0.5 ? 'half' : 'none'}
          >
            ★
          </span>
        ))}
      </span>
      {showValue && <span className={styles.value}>{formatRatingNumber(rating)}</span>}
    </span>
  );
}
