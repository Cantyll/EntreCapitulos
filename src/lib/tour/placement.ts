/*
 * Onde o cartão do tutorial fica (etapa 8k). Função PURA, testada em `tour.test.ts`:
 *  - tela estreita ou baixa (celular, iPhone deitado): folha inferior (`sheet`);
 *  - sem alvo na tela: cartão centralizado (`center`);
 *  - com alvo: abaixo dele se couber, senão acima, sempre dentro da janela e sem cobrir o alvo; se nem acima nem
 *    abaixo couber (alvo muito alto), no canto de baixo à direita (`corner`).
 */

export type Box = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };

export type Placement =
  | { kind: 'sheet' }
  | { kind: 'center' }
  | { kind: 'corner' }
  | { kind: 'anchored'; top: number; left: number; side: 'below' | 'above'; arrowX: number };

export const CARD_MARGIN = 16;
export const CARD_GAP = 14;

/** Celular (retrato ou paisagem) e telas pequenas: folha inferior. O iPad usa o cartão ancorado quando cabe. */
export const SHEET_MEDIA = '(max-width: 699px), (max-height: 499px)';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function placeCard(
  target: Box | null,
  card: Size,
  view: Size & { headerBottom: number },
  sheet: boolean,
): Placement {
  if (sheet) return { kind: 'sheet' };
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

/**
 * Quanto rolar para o alvo ficar visível entre o cabeçalho fixo e o fim da área livre (o topo da folha inferior,
 * no celular). Zero quando já está todo visível. Alvo maior que a área: alinha o topo.
 */
export function scrollDelta(target: Box, area: { top: number; bottom: number }): number {
  const room = area.bottom - area.top;
  if (target.top >= area.top && target.top + target.height <= area.bottom) return 0;
  if (target.height >= room) return target.top - area.top;
  return target.top - area.top - (room - target.height) / 2;
}
