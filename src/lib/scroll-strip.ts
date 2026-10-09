/** Regras puras da faixa rolável (`ScrollStrip`): que lado esfumar e quanto rolar para mostrar um item. */

/** Folga entre o item mostrado e a borda: um pouco mais que o esfumado (24px), para o anel de foco ficar nítido. */
export const STRIP_EDGE = 28;

export type StripFade = 'start' | 'end' | 'both';

/**
 * Que lado ainda tem itens para rolar. Um pixel de folga: com zoom do navegador o `scrollLeft` fica fracionário e a
 * faixa no fim pareceria ter mais um pedaço.
 */
export function stripFade(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): StripFade | null {
  const max = scrollWidth - clientWidth;
  if (max <= 1) return null;
  const start = scrollLeft > 1;
  const end = scrollLeft < max - 1;
  if (start && end) return 'both';
  if (start) return 'start';
  return end ? 'end' : null;
}

/**
 * Quanto rolar (positivo: para a direita) para o item ficar inteiro à vista, a `edge` px das bordas. `left` e `right`
 * são medidos a partir da borda esquerda visível da faixa, e `width` é a largura visível. Já à vista: 0. Item maior que
 * o espaço: alinha o começo dele. O navegador limita a rolagem às pontas, então pedir além do fim é inofensivo.
 */
export function revealOffset(
  left: number,
  right: number,
  width: number,
  edge: number = STRIP_EDGE,
): number {
  if (left >= edge && right <= width - edge) return 0;
  if (left < edge || right - left > width - 2 * edge) return left - edge;
  return right - (width - edge);
}
