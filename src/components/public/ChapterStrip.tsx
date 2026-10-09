import Link from 'next/link';
import type { CSSProperties } from 'react';

import {
  MIN_SEGMENT_PX,
  buildStripBlocks,
  chapterModeStep,
  type ChapterStrip as Strip,
} from '@/lib/chapters';
import { sessionHref } from '@/lib/routes';

import styles from './ChapterStrip.module.css';

/*
 * A fita de capítulos (elemento-assinatura): só desenho, com `aria-hidden`. Dois desenhos no HTML e o
 * CSS mostra um (ver o CSS e `src/lib/chapters/layout.ts`): um segmento por capítulo quando cada um
 * cabe com 3px, ou um bloco por sessão, com uma trilha contínua para o que falta ler.
 *
 * As sessões se abrem pelas pílulas logo abaixo da fita, uma por sessão ("Sessão N · cap. a–b"), em
 * qualquer aparelho: um segmento de capítulo mede uns 10x16px, pequeno demais para o mouse (mínimo de
 * 24px) e para o dedo (44px). Leitor de tela e Tab encontram UM só conjunto de links: as pílulas.
 */
export function ChapterStrip({
  strip,
  bookSlug,
  size = 'hero',
  links = true,
}: {
  strip: Strip;
  bookSlug: string;
  size?: 'hero' | 'compact';
  /** Sem as pílulas: quando a página já leva às sessões por outro caminho (o sumário da home). */
  links?: boolean;
}) {
  if (strip.total < 1) return null;
  const compact = size === 'compact';
  const step = chapterModeStep(strip.total, compact ? 1 : 2);
  const blocks = buildStripBlocks(strip);
  const pills = links ? blocks.filter((block) => block.session || block.kind === 'next') : [];
  const rootClass = [styles.strip, compact && styles.compact, step !== null && styles[`need${step}`]]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      <div className={styles.drawing} aria-hidden="true">
        {step !== null && (
          <div className={styles.byChapter} style={{ '--n': strip.total } as CSSProperties}>
            {strip.segments.map((segment) => (
              <span
                key={segment.chapter}
                className={[styles.seg, styles[segment.kind], segment.tone ? styles.alt : ''].join(
                  ' ',
                )}
                style={{ gridColumn: segment.chapter, gridRow: 1 } as CSSProperties}
              />
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
          {blocks.map((block, index) => (
            <span
              key={block.from}
              className={[styles.seg, styles[block.kind], block.tone ? styles.alt : ''].join(' ')}
              style={{ gridColumn: index + 1, gridRow: 1 } as CSSProperties}
            />
          ))}
        </div>
      </div>
      {pills.length > 0 && (
        <ul className={styles.pills} aria-label="Sessões da fita">
          {pills.map((block) => (
            <li key={block.from}>
              {block.session ? (
                <Link
                  href={sessionHref(bookSlug, block.session.number)}
                  className={[styles.pill, block.kind === 'last' && styles.pill_last]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={block.ariaLabel ?? undefined}
                >
                  Sessão {block.session.number}
                  <small>{chapterRange(block.from, block.to)}</small>
                </Link>
              ) : (
                <span className={`${styles.pill} ${styles.pill_next}`}>
                  Próxima
                  <small>{chapterRange(block.from, block.to)}</small>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function chapterRange(from: number, to: number): string {
  return from === to ? `cap. ${from}` : `cap. ${from}–${to}`;
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
