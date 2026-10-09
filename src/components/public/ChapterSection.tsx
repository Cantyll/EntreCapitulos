'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';

import styles from '@/lib/session-body/render.module.css';

import { CoverFrame } from './Coverable';
import { useReveal } from './useReveal';

/**
 * Um capítulo do relato: `<section id="ch-N" data-chapter="N">` com o título e o texto. O texto chega
 * já renderizado do servidor (`children`); aqui só entra a cobertura. O título do capítulo (que pode
 * ter spoiler) nem é desenhado enquanto o capítulo está coberto: aparece só "Capítulo N". Ao mostrar o
 * capítulo, o título aparece e recebe o foco.
 *
 * Quando o progresso sobe e vários capítulos deixam de estar cobertos de uma vez, cada um se descobre um passo
 * depois do anterior, na ordem de leitura (`unveilStep`). Mostrar um capítulo pelo botão não espera nada.
 */
const MAX_UNVEIL_STEP = 4;

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

  // O progresso anterior (ajuste de estado na renderização): de onde a cascata começa a contar.
  const [seenProgress, setSeenProgress] = useState(progress);
  const [fromProgress, setFromProgress] = useState(progress);
  if (progress !== seenProgress) {
    setSeenProgress(progress);
    setFromProgress(seenProgress);
  }
  const unveilStep = covered
    ? 0
    : Math.min(Math.max(chapter - fromProgress - 1, 0), MAX_UNVEIL_STEP);

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
        unveilStep={unveilStep}
      >
        {children}
      </CoverFrame>
    </section>
  );
}
