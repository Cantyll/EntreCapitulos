import { HEX_COLOR } from './color';

/*
 * Allow-list dos tokens do tema. É a única porta de entrada para valores que viram `style` no
 * <html>: na gravação (upload da capa) e na leitura (layout raiz). Só estas chaves e só #RRGGBB
 * passam; qualquer outra coisa é descartada e o tema padrão rosa vale.
 */
export const THEME_KEYS = [
  '--bg',
  '--surface',
  '--soft',
  '--soft-2',
  '--line',
  '--line-2',
  '--rose',
  '--rose-2',
  '--rose-deep',
  '--rose-tint',
  '--ink',
  '--ink-2',
  '--ink-3',
  '--av1',
  '--av2',
  '--av3',
  '--av4',
] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];
export type ThemeTokens = Record<ThemeKey, string>;

const isHex = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR.test(value);

/**
 * Valida um objeto vindo do banco (ou de qualquer lugar). Chaves desconhecidas são ignoradas.
 * Se faltar alguma das 17 chaves, ou algum valor não for #RRGGBB, devolve `null`: um tema pela
 * metade poderia quebrar o contraste, então é tudo ou nada.
 */
export function parseTokens(input: unknown): ThemeTokens | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const out: Partial<ThemeTokens> = {};
  for (const key of THEME_KEYS) {
    const value = Object.hasOwn(source, key) ? source[key] : undefined;
    if (!isHex(value)) return null;
    out[key] = value.toUpperCase();
  }
  return out as ThemeTokens;
}

/** Objeto para o atributo `style` do <html> (as chaves são as variáveis CSS). */
export function tokensToStyle(tokens: ThemeTokens): Record<string, string> {
  return { ...tokens };
}

export type StoredPaletteColor = { hex: string; share: number };
export type StoredPalette = { colors: StoredPaletteColor[]; accent: string };

/** Valida a paleta guardada (só para mostrar no painel). Entradas inválidas são descartadas. */
export function parsePalette(input: unknown): StoredPalette | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const { colors, accent } = input as { colors?: unknown; accent?: unknown };
  if (!Array.isArray(colors) || !isHex(accent)) return null;
  const clean: StoredPaletteColor[] = [];
  for (const c of colors.slice(0, 12)) {
    const hex = (c as { hex?: unknown } | null)?.hex;
    const share = (c as { share?: unknown } | null)?.share;
    if (isHex(hex) && typeof share === 'number' && share >= 0 && share <= 1) {
      clean.push({ hex: hex.toUpperCase(), share });
    }
  }
  return clean.length > 0 ? { colors: clean, accent: accent.toUpperCase() } : null;
}
