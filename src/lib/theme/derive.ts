import { contrast, fit, hsl } from './color';
import type { PaletteColor } from './palette';
import { THEME_KEYS, type ThemeTokens } from './tokens';

/** Um par de cores do tema com o contraste mínimo que ele tem de cumprir. */
export type ContrastRule = {
  id: string;
  label: string;
  fg: keyof ThemeTokens | '#FFFFFF';
  bg: keyof ThemeTokens;
  min: number;
};

export const CONTRAST_RULES: readonly ContrastRule[] = [
  {
    id: 'white-on-rose-2',
    label: 'Branco sobre o destaque',
    fg: '#FFFFFF',
    bg: '--rose-2',
    min: 4.5,
  },
  {
    id: 'ink-3-on-soft',
    label: 'Texto de apoio sobre o fundo suave',
    fg: '--ink-3',
    bg: '--soft',
    min: 4.5,
  },
  {
    id: 'ink-2-on-soft',
    label: 'Texto secundário sobre o fundo suave',
    fg: '--ink-2',
    bg: '--soft',
    min: 4.5,
  },
  {
    id: 'rose-deep-on-tint',
    label: 'Tom profundo sobre o realce',
    fg: '--rose-deep',
    bg: '--rose-tint',
    min: 7,
  },
  { id: 'ink-on-bg', label: 'Texto principal sobre o fundo', fg: '--ink', bg: '--bg', min: 7 },
  { id: 'rose-on-bg', label: 'Destaque gráfico contra o fundo', fg: '--rose', bg: '--bg', min: 3 },
];

export type ContrastCheck = { id: string; label: string; ratio: number; min: number; ok: boolean };

/** Mede os contrastes de verdade a partir dos tokens (também usado para o selo do painel). */
export function measureContrasts(tokens: ThemeTokens): ContrastCheck[] {
  return CONTRAST_RULES.map((rule) => {
    const fg = rule.fg === '#FFFFFF' ? '#FFFFFF' : tokens[rule.fg];
    const ratio = contrast(fg, tokens[rule.bg]);
    return { id: rule.id, label: rule.label, ratio, min: rule.min, ok: ratio >= rule.min };
  });
}

export const isAccessible = (tokens: ThemeTokens): boolean =>
  measureContrasts(tokens).every((check) => check.ok);

export type DerivedTheme = {
  tokens: ThemeTokens;
  /** A cor da capa em que o tema foi baseado. */
  accent: PaletteColor;
  checks: ContrastCheck[];
};

/**
 * Duas passagens de escolha da cor de destaque. A primeira usa os limiares do protótipo; a segunda,
 * mais tolerante, só roda se nenhuma cor passar (capas pastel ou muito claras). Em ambas o tom é
 * escurecido até cumprir os contrastes, então a garantia de acessibilidade não muda.
 */
const PASSES = [
  { minSaturation: 0.22, minLightness: 0.12, maxLightness: 0.85 },
  { minSaturation: 0.12, minLightness: 0.08, maxLightness: 0.92 },
] as const;

function buildTokens(palette: readonly PaletteColor[], accent: PaletteColor): ThemeTokens {
  const H = accent.h;
  const s = Math.min(Math.max(accent.s, 0.45), 0.78);
  const bg = hsl(H, 0.4, 0.985);
  const tint = hsl(H, 0.7, 0.94);
  const soft = hsl(H, 0.55, 0.96);

  const tokens: Record<string, string> = {
    '--bg': bg,
    '--surface': '#FFFFFF',
    '--soft': soft,
    '--soft-2': hsl(H, 0.5, 0.9),
    '--line': hsl(H, 0.3, 0.9),
    '--line-2': hsl(H, 0.28, 0.82),
    '--rose': fit(H, s, Math.min(accent.l, 0.58), bg, 3),
    '--rose-2': fit(H, s, 0.5, '#FFFFFF', 4.8),
    '--rose-deep': fit(H, Math.min(s, 0.62), 0.32, tint, 7),
    '--rose-tint': tint,
    '--ink': hsl(H, 0.22, 0.11),
    '--ink-2': fit(H, 0.12, 0.4, soft, 5.5),
    '--ink-3': fit(H, 0.1, 0.5, soft, 4.6),
  };

  // Avatares: os quatro tons mais saturados da capa, bem claros (a ordem de desempate é a da paleta).
  const vivid = palette
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.s - a.c.s || a.i - b.i)
    .slice(0, 4);
  for (let i = 0; i < 4; i++) {
    const entry = vivid[i];
    tokens[`--av${i + 1}`] = entry
      ? hsl(entry.c.h, Math.min(Math.max(entry.c.s, 0.35), 0.55), 0.89)
      : tint;
  }
  return tokens as ThemeTokens;
}

/**
 * Deriva os tokens do tema claro a partir da paleta da capa. Devolve `null` quando a capa não tem
 * cor suficiente (cinza, preto e branco) ou quando, por qualquer motivo, algum contraste mínimo
 * não for cumprido: nunca devolve um tema que não passe nos seis pares.
 */
export function deriveTheme(palette: readonly PaletteColor[] | null): DerivedTheme | null {
  if (!palette || palette.length === 0) return null;

  for (const pass of PASSES) {
    const candidates = palette.filter(
      (c) => c.s > pass.minSaturation && c.l > pass.minLightness && c.l < pass.maxLightness,
    );
    if (candidates.length === 0) continue;

    // Maior saturação ponderada pela presença na capa.
    const score = (c: PaletteColor) => c.s * (0.25 + Math.sqrt(c.share));
    const accent = candidates
      .map((c, i) => ({ c, i }))
      .sort((a, b) => score(b.c) - score(a.c) || a.i - b.i)[0]!.c;

    const tokens = buildTokens(palette, accent);
    if (THEME_KEYS.some((key) => !tokens[key])) continue;
    const checks = measureContrasts(tokens);
    if (checks.every((check) => check.ok)) return { tokens, accent, checks };
  }
  return null;
}
