/*
 * Barra de formatação acima do teclado. No Safari do iPhone o teclado NÃO encolhe a janela de
 * layout (`innerHeight`), só a janela visual (`visualViewport`). Um elemento `position: fixed;
 * bottom: 0` ficaria escondido atrás do teclado: a distância entre o fim da janela visual e o fim
 * da janela de layout é o quanto ele precisa subir.
 */

/** Altura mínima que conta como teclado aberto (barras do Safari que se mexem não contam). */
export const KEYBOARD_MIN_INSET = 120;

export type ViewportMetrics = {
  innerHeight: number;
  height: number;
  offsetTop: number;
  scale: number;
};

/** Quanto o teclado cobre da parte de baixo da janela de layout, em px. `0` = sem teclado. */
export function keyboardInset(viewport: ViewportMetrics): number {
  // Com zoom de pinça a janela visual também fica menor: isso não é teclado.
  if (Math.abs(viewport.scale - 1) > 0.01) return 0;
  const inset = Math.round(viewport.innerHeight - viewport.height - viewport.offsetTop);
  return inset >= KEYBOARD_MIN_INSET ? inset : 0;
}
