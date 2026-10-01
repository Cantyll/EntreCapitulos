import { describe, expect, it } from 'vitest';

import { keyboardInset, KEYBOARD_MIN_INSET } from './viewport';

const vp = (over: Partial<Parameters<typeof keyboardInset>[0]> = {}) => ({
  innerHeight: 844,
  height: 844,
  offsetTop: 0,
  scale: 1,
  ...over,
});

describe('keyboardInset', () => {
  it('sem teclado: zero', () => {
    expect(keyboardInset(vp())).toBe(0);
  });

  it('teclado do iPhone aberto: a barra sobe a altura que o teclado cobre', () => {
    expect(keyboardInset(vp({ height: 510 }))).toBe(334);
  });

  it('a janela visual rolada para baixo (offsetTop) entra na conta', () => {
    expect(keyboardInset(vp({ height: 510, offsetTop: 40 }))).toBe(294);
  });

  it('variação pequena (barra do Safari aparecendo) não conta como teclado', () => {
    expect(keyboardInset(vp({ height: 844 - (KEYBOARD_MIN_INSET - 1) }))).toBe(0);
    expect(keyboardInset(vp({ height: 844 - KEYBOARD_MIN_INSET }))).toBe(KEYBOARD_MIN_INSET);
  });

  it('zoom de pinça não é teclado', () => {
    expect(keyboardInset(vp({ height: 400, scale: 2 }))).toBe(0);
  });

  it('nunca devolve negativo', () => {
    expect(keyboardInset(vp({ height: 900 }))).toBe(0);
  });

  it('arredonda frações de pixel', () => {
    expect(keyboardInset(vp({ height: 510.4 }))).toBe(334);
  });
});
