import { describe, expect, it } from 'vitest';

import { PREVIEW_LABELS, PREVIEW_WIDTHS, previewScale } from './preview';

describe('previewScale', () => {
  it('nunca amplia: com espaço de sobra a escala é 1', () => {
    expect(previewScale(2000, 1280)).toBe(1);
    expect(previewScale(390, 390)).toBe(1);
  });

  it('reduz na proporção quando falta espaço', () => {
    expect(previewScale(640, 1280)).toBe(0.5);
    expect(previewScale(320, 390)).toBeCloseTo(0.8205, 3);
  });

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])(
    'medida ruim (%s) vale "ainda sem medida": escala 1, nunca zero nem infinito',
    (available) => {
      expect(previewScale(available, 1280)).toBe(1);
    },
  );

  it('largura simulada ruim também não quebra', () => {
    expect(previewScale(500, 0)).toBe(1);
    expect(previewScale(500, Number.NaN)).toBe(1);
  });

  it('as duas larguras simuladas e os nomes', () => {
    expect(PREVIEW_WIDTHS).toEqual({ phone: 390, desktop: 1280 });
    expect(PREVIEW_LABELS).toEqual({ phone: 'Celular', desktop: 'Computador' });
  });
});
