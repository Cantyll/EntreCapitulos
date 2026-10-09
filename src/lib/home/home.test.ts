import { describe, expect, it } from 'vitest';

import { SWIPE_MIN_PX, TURN_MS, swipeIntent, turnFrames, turnTarget } from './leaf';
import { SPINE_FONT, SPINE_HEIGHTS, SPINE_MIN_FONT, SPINE_WIDTHS, spineFor } from './spine';

describe('turnTarget', () => {
  it('vira para as sessões anteriores e de volta, sem passar das pontas', () => {
    expect(turnTarget(0, 'older', 4)).toBe(1);
    expect(turnTarget(3, 'older', 4)).toBeNull();
    expect(turnTarget(2, 'newer', 4)).toBe(1);
    expect(turnTarget(0, 'newer', 4)).toBeNull();
    expect(turnTarget(0, 'older', 1)).toBeNull();
    expect(turnTarget(0, 'older', 0)).toBeNull();
  });
});

describe('swipeIntent', () => {
  it('arrastar para a direita traz a sessão anterior; para a esquerda, a seguinte', () => {
    expect(swipeIntent(SWIPE_MIN_PX, 0)).toBe('older');
    expect(swipeIntent(-SWIPE_MIN_PX - 10, 4)).toBe('newer');
  });

  it('ignora arrasto curto e rolagem vertical', () => {
    expect(swipeIntent(SWIPE_MIN_PX - 1, 0)).toBeNull();
    expect(swipeIntent(80, 60)).toBeNull();
    expect(swipeIntent(-90, -200)).toBeNull();
  });
});

describe('turnFrames', () => {
  it('avançar levanta a folha até ficar de pé; voltar a deita', () => {
    const lift = turnFrames('newer', false);
    expect(lift.leaf.transform).toEqual(['rotateY(0deg)', 'rotateY(-90deg)']);
    expect(lift.duration).toBe(TURN_MS);
    const land = turnFrames('older', false);
    expect(land.leaf.transform).toEqual(['rotateY(-90deg)', 'rotateY(0deg)']);
    // Levantar acelera; pousar desacelera.
    expect(lift.ease).not.toEqual(land.ease);
  });

  it('no celular a folha gira em torno da borda de cima', () => {
    expect(turnFrames('newer', false, 'x').leaf.transform).toEqual([
      'rotateX(0deg)',
      'rotateX(90deg)',
    ]);
    expect(turnFrames('older', false, 'x').leaf.transform).toEqual([
      'rotateX(90deg)',
      'rotateX(0deg)',
    ]);
  });

  it('nenhuma sombra fica na página depois da virada', () => {
    for (const direction of ['older', 'newer'] as const) {
      for (const reduced of [false, true]) {
        expect(turnFrames(direction, reduced).cast.opacity.at(-1)).toBe(0);
      }
    }
  });

  it('com menos movimento nada gira: só esmaece, e mais rápido', () => {
    for (const direction of ['older', 'newer'] as const) {
      const frames = turnFrames(direction, true);
      expect(frames.leaf.transform).toBeUndefined();
      expect(frames.leaf.opacity).toHaveLength(2);
      expect(frames.duration).toBeLessThan(TURN_MS);
    }
  });
});

describe('spineFor', () => {
  it('é estável e fica dentro das medidas da estante', () => {
    const a = spineFor('A Última Carta de Lisboa');
    expect(spineFor('A Última Carta de Lisboa')).toEqual(a);
    expect(SPINE_HEIGHTS).toContain(a.height);
    expect(SPINE_WIDTHS).toContain(a.width);
  });

  it('encolhe títulos longos, com piso', () => {
    expect(spineFor('Sal e Cinza').fontSize).toBe(SPINE_FONT);
    const long = spineFor('Um título de livro muito comprido que não cabe na lombada');
    expect(long.fontSize).toBeLessThan(SPINE_FONT);
    expect(long.fontSize).toBeGreaterThanOrEqual(SPINE_MIN_FONT);
  });

  it('as lombadas não são todas iguais', () => {
    const titles = [
      'Noites de Âmbar',
      'O Silêncio das Baleias',
      'Cartografia do Afeto',
      'Sal e Cinza',
    ];
    const heights = new Set(titles.map((t) => spineFor(t).height));
    expect(heights.size).toBeGreaterThan(1);
  });
});
