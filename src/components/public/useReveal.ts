'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Estado "revelado" de uma área coberta. Vale só para o progresso em que foi pedido (mudar o progresso
 * cobre de novo) e só nesta visita (nada vai para cookie ou banco). `onRevealed` roda depois que o
 * conteúdo aparece, apenas quando foi a pessoa quem pediu: é onde o foco se move.
 */
export function useReveal(covered: boolean, progress: number, onRevealed?: () => void) {
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const requested = useRef(false);

  const revealed = revealedAt === progress;
  const hidden = covered && !revealed;

  const reveal = useCallback(() => {
    requested.current = true;
    setRevealedAt(progress);
  }, [progress]);

  useEffect(() => {
    if (revealed && requested.current) {
      requested.current = false;
      onRevealed?.();
    }
  }, [revealed, onRevealed]);

  return { hidden, reveal };
}
