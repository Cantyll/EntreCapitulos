/*
 * A pré-visualização da página Sobre no painel: o MESMO componente da página pública (`AboutView`), desenhado numa
 * largura fixa de celular ou de computador e reduzido (`transform: scale`) quando a tela do painel é mais estreita que
 * a largura simulada. Aqui só a conta, pura.
 */

export type PreviewDevice = 'phone' | 'desktop';

/** Larguras simuladas, em px: um iPhone em pé e um computador comum. */
export const PREVIEW_WIDTHS: Record<PreviewDevice, number> = { phone: 390, desktop: 1280 };

export const PREVIEW_LABELS: Record<PreviewDevice, string> = {
  phone: 'Celular',
  desktop: 'Computador',
};

/**
 * Escala para a largura simulada caber no espaço disponível: nunca amplia (no máximo 1) e nunca passa de 0 nem fica
 * infinita com medida ruim (zero, negativa ou NaN valem "sem espaço medido ainda": escala 1).
 */
export function previewScale(available: number, frameWidth: number): number {
  if (
    !Number.isFinite(available) ||
    available <= 0 ||
    !Number.isFinite(frameWidth) ||
    frameWidth <= 0
  ) {
    return 1;
  }
  return Math.min(1, available / frameWidth);
}
