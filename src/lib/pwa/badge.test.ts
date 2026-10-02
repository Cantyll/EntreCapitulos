import { describe, expect, it, vi } from 'vitest';

import { applyAppBadge, normalizeBadgeCount, supportsAppBadge } from './badge';

describe('applyAppBadge', () => {
  it('com a contagem positiva, mostra o número', async () => {
    const nav = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) };
    await applyAppBadge(nav, 7);
    expect(nav.setAppBadge).toHaveBeenCalledWith(7);
    expect(nav.clearAppBadge).not.toHaveBeenCalled();
  });

  it('em zero, apaga o selo (clearAppBadge)', async () => {
    const nav = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) };
    await applyAppBadge(nav, 0);
    expect(nav.clearAppBadge).toHaveBeenCalledTimes(1);
    expect(nav.setAppBadge).not.toHaveBeenCalled();
  });

  it('sem clearAppBadge, zero vira setAppBadge(0)', async () => {
    const nav = { setAppBadge: vi.fn(async () => {}) };
    await applyAppBadge(nav, 0);
    expect(nav.setAppBadge).toHaveBeenCalledWith(0);
  });

  it.each([undefined, {}, { clearAppBadge: async () => {} }])(
    'sem a API (%j) não faz nada e não dá erro',
    async (nav) => {
      await expect(applyAppBadge(nav, 3)).resolves.toBeUndefined();
      expect(supportsAppBadge(nav)).toBe(false);
    },
  );

  it('se a API recusar (permissão), não dá erro', async () => {
    const nav = {
      setAppBadge: vi.fn(async () => {
        throw new DOMException('negado', 'NotAllowedError');
      }),
      clearAppBadge: vi.fn(async () => {
        throw new Error('negado');
      }),
    };
    await expect(applyAppBadge(nav, 2)).resolves.toBeUndefined();
    await expect(applyAppBadge(nav, 0)).resolves.toBeUndefined();
  });

  it.each([
    [5, 5],
    [0, 0],
    [-1, 0],
    [1.5, 0],
    [Number.NaN, 0],
    ['3', 0],
    [undefined, 0],
    [100000, 0],
    [99999, 99999],
  ])('normaliza %j para %j', (input, expected) => {
    expect(normalizeBadgeCount(input)).toBe(expected);
  });
});

describe('painel e o selo', () => {
  it('o layout do painel entrega a contagem que já calcula ao componente', async () => {
    const { readFileSync } = await import('node:fs');
    const layout = readFileSync('src/app/painel/layout.tsx', 'utf8');
    expect(layout).toMatch(/<AppBadge count=\{pendingCommentsCount\} \/>/);
    const component = readFileSync('src/components/admin/AppBadge.tsx', 'utf8');
    expect(component).toMatch(/applyAppBadge\(/);
  });
});
