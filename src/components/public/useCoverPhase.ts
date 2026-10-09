'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Fase do movimento de uma cobertura de spoiler. `still` é o estado parado (inclusive ao abrir a página: nada
 * se anima no carregamento); `unveiling` dura enquanto a névoa se desfaz e o cartão de revelar sai; `veiling`,
 * enquanto ela volta (a pessoa diminuiu o progresso). Quem desenha decide o que cada fase anima.
 *
 * `settle` encerra a fase (no fim da animação). Um prazo de reserva também a encerra: com "menos movimento" o
 * navegador pode não disparar `animationend`, e o cartão que sai nunca deve ficar preso na tela.
 */
export type CoverPhase = 'still' | 'unveiling' | 'veiling';

const SETTLE_FALLBACK_MS = 1200;

export function useCoverPhase(hidden: boolean) {
  const [seen, setSeen] = useState(hidden);
  const [phase, setPhase] = useState<CoverPhase>('still');

  // Ajuste de estado na renderização (padrão do React): a fase muda junto com a cobertura, sem um quadro parado.
  if (hidden !== seen) {
    setSeen(hidden);
    setPhase(hidden ? 'veiling' : 'unveiling');
  }

  const settle = useCallback(() => setPhase('still'), []);

  useEffect(() => {
    if (phase === 'still') return;
    const timer = window.setTimeout(settle, SETTLE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [phase, settle]);

  return { phase, settle };
}
