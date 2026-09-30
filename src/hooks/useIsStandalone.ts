'use client';

import { useSyncExternalStore } from 'react';

const STANDALONE_QUERY = '(display-mode: standalone)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot() {
  // navigator.standalone só existe no Safari do iOS/iPadOS, sem tipo no lib.dom.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia(STANDALONE_QUERY).matches || iosStandalone;
}

// No servidor e na hidratação o valor é sempre false; o valor real entra logo depois.
function getServerSnapshot() {
  return false;
}

/**
 * Diz se o site está aberto como app instalado (Tela de Início no iOS, "Adicionar ao Dock" no Mac,
 * instalação no Chrome). Nesse modo não há barra de endereço nem botão voltar do navegador.
 */
export function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
