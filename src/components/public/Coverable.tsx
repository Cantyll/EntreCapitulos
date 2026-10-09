'use client';

import { useId, type AnimationEvent, type CSSProperties, type ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';

import styles from './Coverable.module.css';
import { useCoverPhase } from './useCoverPhase';
import { useReveal } from './useReveal';

/*
 * Cobertura de spoiler acessível. O conteúdo coberto CONTINUA no HTML (o filtro é uma cortesia de
 * leitura, não uma trava de segurança), mas fica `inert` (sem foco, sem clique), `aria-hidden` (fora
 * do leitor de tela) e borrado. O botão para mostrar fica FORA da área inerte, com `aria-expanded` e
 * `aria-controls`.
 */

type CoverProps = {
  hidden: boolean;
  onReveal: () => void;
  progress: number;
  progressKnown: boolean;
  buttonLabel: string;
  /** Frase acima do botão. Sem ela, uma padrão sobre o progresso. */
  hint?: string;
  className?: string;
  /**
   * Atraso da névoa ao se desfazer, em passos (0 a 4). Quando o progresso sobe e vários capítulos aparecem de uma
   * vez, eles se descobrem na ordem de leitura.
   */
  unveilStep?: number;
  children: ReactNode;
};

/** Apresentação da cobertura; quem decide `hidden` é o pai (`useReveal`). */
export function CoverFrame({
  hidden,
  onReveal,
  progress,
  progressKnown,
  buttonLabel,
  hint,
  className,
  unveilStep = 0,
  children,
}: CoverProps) {
  const contentId = useId();
  const { phase, settle } = useCoverPhase(hidden);
  // O cartão de revelar continua na tela enquanto some (desabilitado e fora do leitor de tela); depois sai do HTML.
  // Sem `inert`: a área inerte é só o conteúdo coberto.
  const leaving = !hidden && phase === 'unveiling';
  const onContentAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) settle();
  };

  return (
    <div className={[styles.coverable, className].filter(Boolean).join(' ')}>
      <div
        id={contentId}
        className={hidden ? styles.covered : leaving ? styles.unveil : undefined}
        style={
          leaving && unveilStep > 0
            ? ({ '--unveil-step': unveilStep } as CSSProperties)
            : undefined
        }
        inert={hidden}
        aria-hidden={hidden ? true : undefined}
        onAnimationEnd={leaving ? onContentAnimationEnd : undefined}
      >
        {children}
      </div>
      {(hidden || leaving) && (
        <div
          className={[
            styles.veil,
            leaving ? styles.veilOut : phase === 'veiling' ? styles.veilIn : null,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden={leaving ? true : undefined}
        >
          <button
            type="button"
            className={styles.reveal}
            aria-expanded={false}
            aria-controls={contentId}
            disabled={leaving}
            onClick={onReveal}
          >
            <Icon name="eyeOff" />
            <span>
              {hint ??
                (progressKnown
                  ? `Você marcou que leu até o capítulo ${progress}.`
                  : 'Você ainda não marcou até onde leu.')}
            </span>
            <small>{buttonLabel}</small>
          </button>
          {/* Só no papel (o botão não serve impresso). Na tela fica escondido, também do leitor de tela. */}
          <p className={styles.printNote}>
            Trecho coberto pelo filtro de spoiler. Para imprimi-lo, mostre-o na tela antes.
          </p>
        </div>
      )}
    </div>
  );
}

/** Um bloco que se cobre sozinho (trechos e anotações, perguntas). O título fica de fora, sempre visível. */
export function CoverableBlock({
  covered,
  progress,
  progressKnown,
  buttonLabel,
  hint,
  children,
}: {
  covered: boolean;
  progress: number;
  progressKnown: boolean;
  buttonLabel: string;
  hint?: string;
  children: ReactNode;
}) {
  const { hidden, reveal } = useReveal(covered, progress);
  return (
    <CoverFrame
      hidden={hidden}
      onReveal={reveal}
      progress={progress}
      progressKnown={progressKnown}
      buttonLabel={buttonLabel}
      hint={hint}
    >
      {children}
    </CoverFrame>
  );
}
