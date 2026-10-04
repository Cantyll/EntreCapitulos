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
 *
 * Sem consumidor por enquanto, e segue disponível. O cartão "Instale o Entre Capítulos" (etapa 8e) NÃO usa este
 * hook: ele decide no navegador, depois da montagem, com as funções puras de `src/lib/pwa/platform.ts`
 * (`readPlatform`, `installEligibility`), que também separam o Safari do iPhone dos outros navegadores.
 */
export function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
