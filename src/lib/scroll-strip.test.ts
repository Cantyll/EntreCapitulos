import { describe, expect, it } from 'vitest';

import { revealOffset, STRIP_EDGE, stripFade } from './scroll-strip';

describe('stripFade', () => {
  it('não esfuma quando tudo cabe', () => {
    expect(stripFade(0, 300, 300)).toBeNull();
    expect(stripFade(0, 301, 300)).toBeNull();
  });

  it('esfuma o fim no começo, os dois lados no meio e o começo no fim', () => {
    expect(stripFade(0, 500, 300)).toBe('end');
    expect(stripFade(100, 500, 300)).toBe('both');
    expect(stripFade(200, 500, 300)).toBe('start');
  });

  it('tolera o scrollLeft fracionário do zoom', () => {
    expect(stripFade(0.6, 500, 300)).toBe('end');
    expect(stripFade(199.4, 500, 300)).toBe('start');
  });
});

describe('revealOffset', () => {
  const width = 300;

  it('não rola o que já está à vista', () => {
    expect(revealOffset(40, 120, width)).toBe(0);
    expect(revealOffset(STRIP_EDGE, width - STRIP_EDGE, width)).toBe(0);
  });

  it('rola para a direita até o item sair do esfumado do fim', () => {
    expect(revealOffset(250, 330, width)).toBe(330 - (width - STRIP_EDGE));
  });

  it('rola para a esquerda até o item sair do esfumado do começo', () => {
    expect(revealOffset(-60, 20, width)).toBe(-60 - STRIP_EDGE);
  });

  it('item maior que o espaço: alinha o começo', () => {
    expect(revealOffset(100, 500, width)).toBe(100 - STRIP_EDGE);
  });
});
