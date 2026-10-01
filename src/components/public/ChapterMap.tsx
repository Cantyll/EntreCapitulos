import Link from 'next/link';

import { segmentLabel, type ChapterStrip as Strip } from '@/lib/chapters';
import { sessionHref } from '@/lib/routes';

import styles from './ChapterMap.module.css';

/** Mapa de capítulos (página do livro): um bloco numerado por capítulo, com link nos que têm sessão. */
export function ChapterMap({ strip, bookSlug }: { strip: Strip; bookSlug: string }) {
  if (strip.total < 1) return null;
  return (
    <ol className={styles.map} aria-label="Mapa de capítulos">
      {strip.segments.map((segment) => {
        const className = `${styles.tile} ${styles[segment.kind]} ${segment.tone ? styles.alt : ''}`;
        const label = segmentLabel(segment);
        return (
          <li key={segment.chapter} className={styles.item}>
            {segment.session ? (
              <Link
                href={sessionHref(bookSlug, segment.session.number)}
                className={className}
                aria-label={label}
                title={label}
              >
                {segment.chapter}
              </Link>
            ) : (
              <span className={className} title={label} aria-label={label} role="img">
                <span aria-hidden="true">{segment.chapter}</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
