/*
 * Matemática de cor do tema automático. TypeScript puro, sem DOM: roda no servidor (upload da
 * capa) e nos testes. Porte de docs/theme-engine.reference.js.
 */

export type Rgb = readonly [number, number, number];
export type Hsl = readonly [number, number, number];

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** Matiz em graus (0 a 360), saturação e luminosidade (0 a 1). */
export function rgbToHsl([r0, g0, b0]: Rgb): Hsl {
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb([h, s, l]: Hsl): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export const hsl = (h: number, s: number, l: number): string => rgbToHex(hslToRgb([h, s, l]));

/** Luminância relativa (WCAG 2). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste (WCAG 2), de 1 a 21. */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Escurece o tom (passo de 1% de luminosidade) até atingir o contraste mínimo contra `against`. */
export function fit(h: number, s: number, l: number, against: string, target: number): string {
  let light = l;
  let color = hsl(h, s, light);
  for (let i = 0; i < 100 && contrast(color, against) < target; i++) {
    light = Math.max(0, light - 0.01);
    color = hsl(h, s, light);
  }
  return color;
}
