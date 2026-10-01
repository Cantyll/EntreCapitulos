import Link from 'next/link';
import type { CSSProperties } from 'react';

import { segmentLabel, type ChapterStrip as Strip } from '@/lib/chapters';
import { sessionHref } from '@/lib/routes';

import styles from './ChapterStrip.module.css';

/*
 * A fita de capítulos (elemento-assinatura): um segmento por capítulo, os das sessões agrupados e
 * rotulados (S4) e a próxima sessão tracejada. Cada segmento de sessão é um link com nome acessível
 * ("Capítulo 10, sessão 4"). O estado nunca depende só da cor: cheio, mais escuro (a última), tracejado
 * (a próxima) e vazado (por ler) têm forma própria, mais os rótulos e a legenda.
 */
export function ChapterStrip({
  strip,
  bookSlug,
  size = 'hero',
}: {
  strip: Strip;
  bookSlug: string;
  size?: 'hero' | 'compact';
}) {
  if (strip.total < 1) return null;
  const compact = size === 'compact';

  return (
    <div
      className={compact ? `${styles.strip} ${styles.compact}` : styles.strip}
      style={{ '--n': strip.total } as CSSProperties}
    >
      {strip.segments.map((segment) => {
        const className = `${styles.seg} ${styles[segment.kind]} ${segment.tone ? styles.alt : ''}`;
        const style = { gridColumn: segment.chapter, gridRow: 1 } as CSSProperties;
        return segment.session ? (
          <Link
            key={segment.chapter}
            href={sessionHref(bookSlug, segment.session.number)}
            className={className}
            style={style}
            aria-label={segmentLabel(segment)}
            title={segmentLabel(segment)}
          />
        ) : (
          // Sem link: desenho puro. Os 50 capítulos "ainda não lidos" não precisam ser lidos em voz alta.
          <span
            key={segment.chapter}
            className={className}
            style={style}
            title={segmentLabel(segment)}
            aria-hidden="true"
          />
        );
      })}
      {!compact &&
        strip.labels.map((label) => (
          <span
            key={`${label.kind}-${label.text}`}
            className={`${styles.label} ${styles[`label_${label.kind}`]}`}
            style={{ gridColumn: `${label.from} / ${label.to + 1}`, gridRow: 2 } as CSSProperties}
          >
            {label.text}
          </span>
        ))}
    </div>
  );
}

/** Legenda: o que cada forma significa. Texto sempre ao lado do desenho. */
export function ChapterLegend({ hasSessions, hasNext }: { hasSessions: boolean; hasNext: boolean }) {
  return (
    <ul className={styles.legend} aria-label="Legenda da fita">
      <li>
        <i className={`${styles.swatch} ${styles.read}`} aria-hidden="true" />
        lidos
      </li>
      {hasSessions && (
        <>
          <li>
            <i className={`${styles.swatch} ${styles.session}`} aria-hidden="true" />
            com sessão
          </li>
          <li>
            <i className={`${styles.swatch} ${styles.last}`} aria-hidden="true" />
            última sessão
          </li>
        </>
      )}
      {hasNext && (
        <li>
          <i className={`${styles.swatch} ${styles.next}`} aria-hidden="true" />
          próxima sessão
        </li>
      )}
      <li>
        <i className={`${styles.swatch} ${styles.unread}`} aria-hidden="true" />
        por ler
      </li>
    </ul>
  );
}
