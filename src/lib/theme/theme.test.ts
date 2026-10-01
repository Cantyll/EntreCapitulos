import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { contrast, hexToRgb, rgbToHex, rgbToHsl, hsl } from './color';
import { deriveTheme, isAccessible, measureContrasts } from './derive';
import { coverLike, image, prng, solid } from './fixtures';
import { extractPalette, type PaletteColor } from './palette';
import { THEME_KEYS } from './tokens';

const palette = (img: ReturnType<typeof solid>) => extractPalette(img.data, img.width, img.height);
const themeOf = (img: ReturnType<typeof solid>) => deriveTheme(palette(img));

function expectAllContrasts(theme: NonNullable<ReturnType<typeof deriveTheme>>) {
  const byId = Object.fromEntries(measureContrasts(theme.tokens).map((c) => [c.id, c.ratio]));
  expect(byId['white-on-rose-2']).toBeGreaterThanOrEqual(4.5);
  expect(byId['ink-3-on-soft']).toBeGreaterThanOrEqual(4.5);
  expect(byId['ink-2-on-soft']).toBeGreaterThanOrEqual(4.5);
  expect(byId['rose-deep-on-tint']).toBeGreaterThanOrEqual(7);
  expect(byId['ink-on-bg']).toBeGreaterThanOrEqual(7);
  expect(byId['rose-on-bg']).toBeGreaterThanOrEqual(3);
  expect(theme.checks.every((c) => c.ok)).toBe(true);
}

describe('cor', () => {
  it('converte hex e HSL de ida e volta', () => {
    expect(rgbToHex(hexToRgb('#CF6C88'))).toBe('#CF6C88');
    const [h, s, l] = rgbToHsl(hexToRgb('#CF6C88'));
    expect(hsl(h, s, l)).toBe('#CF6C88');
  });

  it('mede o contraste de referência do WCAG', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('o tema padrão rosa cumpre os seis pares', () => {
    const tokens = {
      '--bg': '#FFF8F9',
      '--surface': '#FFFFFF',
      '--soft': '#FDEFF2',
      '--soft-2': '#F7DDE4',
      '--line': '#F1DDE3',
      '--line-2': '#E7C8D1',
      '--rose': '#CF6C88',
      '--rose-2': '#B04C69',
      '--rose-deep': '#7E3350',
      '--rose-tint': '#FBE6EC',
      '--ink': '#2A1E24',
      '--ink-2': '#6C5961',
      '--ink-3': '#7B6671',
      '--av1': '#F8DCE3',
      '--av2': '#F3E3D6',
      '--av3': '#E4E9F0',
      '--av4': '#EFE0EA',
    };
    expect(isAccessible(tokens)).toBe(true);
  });
});

describe('extractPalette', () => {
  it('ignora transparente e quase branco', () => {
    expect(palette(solid([255, 255, 255]))).toBeNull();
    expect(palette(solid([250, 250, 250]))).toBeNull();
    expect(palette(image(96, 144, () => [200, 30, 60, 0]))).toBeNull();
  });

  it('recusa buffer com tamanho errado', () => {
    expect(extractPalette(new Uint8ClampedArray(10), 96, 144)).toBeNull();
    expect(extractPalette(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });

  it('devolve cores ordenadas por participação, somando até 1', () => {
    const img = coverLike([
      [180, 30, 50],
      [180, 30, 50],
      [30, 60, 160],
    ]);
    const pal = palette(img)!;
    expect(pal.length).toBeGreaterThan(1);
    for (let i = 1; i < pal.length; i++)
      expect(pal[i - 1]!.share).toBeGreaterThanOrEqual(pal[i]!.share);
    expect(pal.reduce((a, c) => a + c.share, 0)).toBeGreaterThan(0.9);
    expect(pal.reduce((a, c) => a + c.share, 0)).toBeLessThanOrEqual(1.0000001);
  });

  it('é determinística', () => {
    const rnd = prng(7);
    const noise = image(96, 144, () => [rnd() * 255, rnd() * 255, rnd() * 255]);
    expect(palette(noise)).toEqual(palette(noise));
  });

  it('lê pixels reais de um PNG gerado com sharp', async () => {
    const png = await sharp({
      create: { width: 200, height: 300, channels: 3, background: '#B02050' },
    })
      .png()
      .toBuffer();
    const { data, info } = await sharp(png)
      .resize({ width: 96 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pal = extractPalette(data, info.width, info.height)!;
    expect(pal[0]!.share).toBeGreaterThan(0.9);
    expect(deriveTheme(pal)).not.toBeNull();
  });
});

describe('deriveTheme', () => {
  it('capa colorida: gera as 17 variáveis e cumpre os seis contrastes', () => {
    const theme = themeOf(
      coverLike([
        [200, 40, 70],
        [30, 40, 120],
        [230, 170, 40],
      ]),
    )!;
    expect(theme).not.toBeNull();
    expect(Object.keys(theme.tokens).sort()).toEqual([...THEME_KEYS].sort());
    for (const value of Object.values(theme.tokens)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
    expectAllContrasts(theme);
  });

  it('capa de uma cor só', () => {
    const theme = themeOf(solid([20, 120, 90]))!;
    expect(theme).not.toBeNull();
    expectAllContrasts(theme);
  });

  it('capa muito escura mas colorida', () => {
    const theme = themeOf(
      coverLike([
        [20, 25, 70],
        [30, 20, 60],
      ]),
    )!;
    expect(theme).not.toBeNull();
    expectAllContrasts(theme);
  });

  it('capa quase preta não tem cor: null', () => {
    expect(themeOf(solid([6, 6, 8]))).toBeNull();
  });

  it('capa em tons de cinza: null', () => {
    expect(
      themeOf(
        coverLike([
          [40, 40, 40],
          [128, 128, 128],
          [200, 200, 200],
        ]),
      ),
    ).toBeNull();
    expect(themeOf(solid([120, 120, 120]))).toBeNull();
  });

  it('preto e branco: null', () => {
    expect(
      themeOf(image(96, 144, (x, y) => ((x + y) % 2 ? [0, 0, 0] : [255, 255, 255]))),
    ).toBeNull();
  });

  it('capa muito clara, só passa na segunda passagem: tema válido', () => {
    // Luminosidade ~0,89: fora dos limiares do protótipo (< 0,85), dentro dos tolerantes (< 0,92).
    const img = coverLike([
      [240, 214, 224],
      [238, 210, 222],
    ]);
    const pal = palette(img)!;
    expect(pal.every((c) => c.l >= 0.85)).toBe(true);
    const theme = deriveTheme(pal)!;
    expect(theme).not.toBeNull();
    expectAllContrasts(theme);
  });

  it('capa pastel gera tema válido', () => {
    const theme = themeOf(
      coverLike([
        [200, 220, 245],
        [225, 205, 240],
        [245, 215, 210],
      ]),
    )!;
    expect(theme).not.toBeNull();
    expectAllContrasts(theme);
  });

  it('cinza claro quase sem saturação continua nulo, mesmo na segunda passagem', () => {
    expect(themeOf(solid([236, 231, 233]))).toBeNull();
  });

  it('cores muito claras demais (acima de 0,92) são ignoradas', () => {
    expect(deriveTheme([{ hex: '#F5EAF0', share: 1, h: 330, s: 0.5, l: 0.94 }])).toBeNull();
  });

  it('paleta nula ou vazia: null', () => {
    expect(deriveTheme(null)).toBeNull();
    expect(deriveTheme([])).toBeNull();
  });

  it('é determinística', () => {
    const img = coverLike([
      [200, 40, 70],
      [30, 40, 120],
    ]);
    expect(themeOf(img)).toEqual(themeOf(img));
  });

  it('propriedade: com 2000 paletas aleatórias, ou cumpre os seis contrastes ou é null', () => {
    const rnd = prng(2026);
    let withTheme = 0;
    for (let n = 0; n < 2000; n++) {
      const count = 1 + Math.floor(rnd() * 7);
      const colors: PaletteColor[] = Array.from({ length: count }, () => {
        const h = rnd() * 360;
        const s = rnd();
        const l = rnd();
        return { hex: hsl(h, s, l), share: rnd() / count, h, s, l };
      });
      const theme = deriveTheme(colors);
      if (theme === null) continue;
      withTheme++;
      expect(isAccessible(theme.tokens)).toBe(true);
      expect(theme.checks.every((c) => c.ok)).toBe(true);
    }
    expect(withTheme).toBeGreaterThan(500);
  });
});
