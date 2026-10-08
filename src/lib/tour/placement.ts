/*
 * Onde o cartão do tutorial fica (etapa 8k; refeito para o celular depois do teste no aplicativo). Funções PURAS,
 * testadas em `tour.test.ts`.
 *
 * Computador e iPad: abaixo do alvo se couber, senão acima, sempre dentro da janela e sem cobrir o alvo; sem alvo na
 * tela, centralizado; alvo alto demais, no canto de baixo à direita (`corner`).
 *
 * Celular (retrato ou paisagem, `COMPACT_MEDIA`):
 *  1. Balão junto do alvo, com a largura da tela menos as margens e as áreas seguras: abaixo se couber, senão acima.
 *     A barra de baixo do painel e a barra de ações da Página Sobre (fixas) ficam visíveis, com o balão acima delas.
 *  2. Não coube (alvo alto, celular deitado): folha presa a uma borda da tela, EMBAIXO ou EM CIMA, a que cobrir menos do
 *     alvo. Sem alvo, embaixo.
 *  `lock: 'sheet'` mantém a folha até o fim do passo: o balão e a folha têm larguras diferentes (e por isso alturas
 *  diferentes), e sem a trava o cartão poderia alternar entre os dois a cada medida.
 */

export type Box = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };
/** Áreas seguras do aparelho (entalhe, indicador de início), em px. */
export type Insets = { top: number; right: number; bottom: number; left: number };
export type View = Size & { headerBottom: number; insets?: Insets };

export type Placement =
  | { kind: 'sheet'; side: 'top' | 'bottom' }
  | { kind: 'center' }
  | { kind: 'corner' }
  | {
      kind: 'anchored';
      top: number;
      left: number;
      side: 'below' | 'above';
      arrowX: number;
      /** Só no celular: a largura do balão (no computador, a do CSS). */
      width?: number;
    };

export const CARD_MARGIN = 16;
export const CARD_GAP = 14;

/** Celular (retrato ou paisagem) e janelas pequenas. O iPad usa o desenho do computador. */
export const COMPACT_MEDIA = '(max-width: 699px), (max-height: 499px)';

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Quanto de `box` (na vertical) fica entre `from` e `to`. */
function verticalOverlap(box: Box, from: number, to: number): number {
  return Math.max(0, Math.min(box.top + box.height, to) - Math.max(box.top, from));
}

/** Limites onde o cartão pode ficar sem passar do cabeçalho, das margens e das áreas seguras. */
function limits(view: View) {
  const insets = view.insets ?? NO_INSETS;
  return {
    top: Math.max(CARD_MARGIN + insets.top, view.headerBottom + 8),
    bottom: view.height - Math.max(CARD_MARGIN, insets.bottom + 8),
    left: Math.max(CARD_MARGIN, insets.left),
    right: view.width - Math.max(CARD_MARGIN, insets.right),
  };
}

function placeDesktop(target: Box | null, card: Size, view: View): Placement {
  if (!target) return { kind: 'center' };
  const below = view.height - (target.top + target.height) - CARD_GAP - CARD_MARGIN;
  const above = target.top - CARD_GAP - Math.max(CARD_MARGIN, view.headerBottom + 8);
  let top: number;
  let side: 'below' | 'above';
  if (card.height <= below) {
    top = target.top + target.height + CARD_GAP;
    side = 'below';
  } else if (card.height <= above) {
    top = target.top - CARD_GAP - card.height;
    side = 'above';
  } else {
    return { kind: 'corner' };
  }
  const centerX = target.left + target.width / 2;
  const left = clamp(centerX - card.width / 2, CARD_MARGIN, view.width - card.width - CARD_MARGIN);
  const arrowX = clamp(centerX - left, 20, card.width - 20);
  return { kind: 'anchored', top, left, side, arrowX };
}

function placeCompact(
  target: Box | null,
  card: Size,
  view: View,
  lock: 'sheet' | undefined,
): Placement {
  if (!target) return { kind: 'sheet', side: 'bottom' };
  const edge = limits(view);
  const onScreen = target.top + target.height > 0 && target.top < view.height;

  if (lock !== 'sheet' && onScreen) {
    const width = edge.right - edge.left;
    const centerX = target.left + target.width / 2;
    const arrowX = clamp(centerX - edge.left, 20, width - 20);
    // Abaixo vale mesmo encostando no cabeçalho (o alvo pode estar nele, como o "?"); acima, nunca por baixo dele.
    const belowTop = target.top + target.height + CARD_GAP;
    const belowMin = Math.max(CARD_MARGIN, (view.insets ?? NO_INSETS).top);
    if (belowTop >= belowMin && belowTop + card.height <= edge.bottom) {
      return { kind: 'anchored', top: belowTop, left: edge.left, side: 'below', arrowX, width };
    }
    const aboveTop = target.top - CARD_GAP - card.height;
    if (aboveTop >= edge.top && target.top <= edge.bottom) {
      return { kind: 'anchored', top: aboveTop, left: edge.left, side: 'above', arrowX, width };
    }
  }

  // Folha: primeiro, a borda que deixa à vista o COMEÇO do alvo (o título de uma lista longa); se as duas deixam (ou
  // nenhuma deixa), a que cobre menos dele. Empate: embaixo, o lugar de costume.
  const startClearOfBottom = target.top < view.height - card.height;
  const startClearOfTop = target.top >= card.height;
  if (startClearOfBottom !== startClearOfTop) {
    return { kind: 'sheet', side: startClearOfBottom ? 'bottom' : 'top' };
  }
  const coverBottom = verticalOverlap(target, view.height - card.height, view.height);
  const coverTop = verticalOverlap(target, 0, card.height);
  return { kind: 'sheet', side: coverTop < coverBottom ? 'top' : 'bottom' };
}

export function placeCard(
  target: Box | null,
  card: Size,
  view: View,
  compact: boolean,
  lock?: 'sheet',
): Placement {
  return compact ? placeCompact(target, card, view, lock) : placeDesktop(target, card, view);
}

/**
 * Onde o alvo deve ficar depois da rolagem: entre o cabeçalho fixo e o fim da área livre. No celular, a área livre
 * termina onde o balão precisa começar (deixa espaço para ele abaixo do alvo); se o cartão for grande demais para
 * isso, vale a tela inteira (o cartão vira folha).
 */
export function scrollArea(
  view: View,
  card: Size,
  compact: boolean,
): { top: number; bottom: number } {
  const top = view.headerBottom + 12;
  if (!compact) return { top, bottom: view.height - 12 };
  const edge = limits(view);
  const bottom = edge.bottom - card.height - CARD_GAP;
  return bottom - top >= 44 ? { top, bottom } : { top, bottom: view.height - 12 };
}

/**
 * Quanto rolar para o alvo ficar visível na área. Zero quando já está todo visível. Alvo maior que a área: alinha o
 * topo.
 */
export function scrollDelta(target: Box, area: { top: number; bottom: number }): number {
  const room = area.bottom - area.top;
  if (target.top >= area.top && target.top + target.height <= area.bottom) return 0;
  if (target.height >= room) return target.top - area.top;
  return target.top - area.top - (room - target.height) / 2;
}

/**
 * O contorno de destaque recortado à janela (com uma folga de `pad`). Um alvo de milhares de pixels (a lista de livros)
 * não vira um elemento fixo do mesmo tamanho. `null` quando nada do alvo está na tela.
 */
export function clipToView(target: Box, view: Size, pad: number): Box | null {
  const top = Math.max(target.top - pad, -2);
  const left = Math.max(target.left - pad, -2);
  const bottom = Math.min(target.top + target.height + pad, view.height + 2);
  const right = Math.min(target.left + target.width + pad, view.width + 2);
  if (bottom <= top || right <= left) return null;
  return { top, left, width: right - left, height: bottom - top };
}
