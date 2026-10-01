'use client';

import { useCallback, useRef, type ReactNode } from 'react';

import styles from '@/lib/session-body/render.module.css';

import { CoverFrame } from './Coverable';
import { useReveal } from './useReveal';

/**
 * Um capítulo do relato: `<section id="ch-N" data-chapter="N">` com o título e o texto. O texto chega
 * já renderizado do servidor (`children`); aqui só entra a cobertura. O título do capítulo (que pode
 * ter spoiler) nem é desenhado enquanto o capítulo está coberto: aparece só "Capítulo N". Ao mostrar o
 * capítulo, o título aparece e recebe o foco.
 */
export function ChapterSection({
  chapter,
  title,
  covered,
  progress,
  progressKnown,
  children,
}: {
  chapter: number;
  title: string | null;
  covered: boolean;
  progress: number;
  progressKnown: boolean;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useCallback(() => heading.current?.focus(), []);
  const { hidden, reveal } = useReveal(covered, progress, focusHeading);

  return (
    <section id={`ch-${chapter}`} data-chapter={chapter} className={styles.section}>
      <h2 ref={heading} tabIndex={-1} className={styles.chapter}>
        <small>Capítulo {chapter}</small>
        {!hidden && title ? title : null}
      </h2>
      <CoverFrame
        hidden={hidden}
        onReveal={reveal}
        progress={progress}
        progressKnown={progressKnown}
        buttonLabel={`Mostrar o capítulo ${chapter} mesmo assim`}
      >
        {children}
      </CoverFrame>
    </section>
  );
}
