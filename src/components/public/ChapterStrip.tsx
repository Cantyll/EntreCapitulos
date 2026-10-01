import Link from 'next/link';
import type { CSSProperties } from 'react';

import {
  MIN_SEGMENT_PX,
  buildStripBlocks,
  chapterModeStep,
  segmentLabel,
  type ChapterStrip as Strip,
} from '@/lib/chapters';
import { sessionHref } from '@/lib/routes';

import styles from './ChapterStrip.module.css';

/** Só "last" e "next" têm estilo próprio; o rótulo de uma sessão comum usa o base. */
function labelClass(kind: string): string {
  if (kind === 'last') return `${styles.label} ${styles.label_last}`;
  if (kind === 'next') return `${styles.label} ${styles.label_next}`;
  return styles.label!;
}

/*
 * A fita de capítulos (elemento-assinatura). Dois desenhos no HTML e o CSS mostra um (ver o CSS e
 * `src/lib/chapters/layout.ts`): um segmento por capítulo quando cada um cabe com 3px, ou um bloco por
 * sessão, com uma trilha contínua para o que falta ler. Os segmentos e blocos de sessão são links com
 * nome acessível ("Capítulo 10, sessão 4"; "Sessão 1, capítulos 1 a 3"); o resto é só desenho.
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
  const step = chapterModeStep(strip.total, compact ? 1 : 2);
  const blocks = buildStripBlocks(strip);
  const rootClass = [styles.strip, compact && styles.compact, step !== null && styles[`need${step}`]]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      {step !== null && (
        <div className={styles.byChapter} style={{ '--n': strip.total } as CSSProperties}>
          {strip.segments.map((segment) => {
            const className = [
              styles.seg,
              styles[segment.kind],
              segment.tone ? styles.alt : '',
            ].join(' ');
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
              // Sem link: desenho puro. Os capítulos "ainda não lidos" não precisam ser lidos em voz alta.
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
                className={labelClass(label.kind)}
                style={
                  { gridColumn: `${label.from} / ${label.to + 1}`, gridRow: 2 } as CSSProperties
                }
              >
                {label.text}
              </span>
            ))}
        </div>
      )}
      <div
        className={styles.bySession}
        style={{
          gridTemplateColumns: blocks
            .map((block) => `minmax(${MIN_SEGMENT_PX}px, ${block.span}fr)`)
            .join(' '),
        }}
      >
        {blocks.map((block, index) => {
          const className = [styles.seg, styles[block.kind], block.tone ? styles.alt : ''].join(' ');
          const style = { gridColumn: index + 1, gridRow: 1 } as CSSProperties;
          return block.session ? (
            <Link
              key={block.from}
              href={sessionHref(bookSlug, block.session.number)}
              className={className}
              style={style}
              aria-label={block.ariaLabel ?? undefined}
              title={block.ariaLabel ?? undefined}
            />
          ) : (
            <span key={block.from} className={className} style={style} aria-hidden="true" />
          );
        })}
        {!compact &&
          blocks.map((block, index) =>
            block.label ? (
              <span
                key={`label-${block.from}`}
                className={labelClass(block.kind)}
                style={{ gridColumn: index + 1, gridRow: 2 } as CSSProperties}
              >
                {block.label}
              </span>
            ) : null,
          )}
      </div>
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
