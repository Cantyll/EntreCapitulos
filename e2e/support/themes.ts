import { deriveTheme } from '../../src/lib/theme/derive';
import { extractPalette } from '../../src/lib/theme/palette';
import { tokensToStyle, type ThemeTokens } from '../../src/lib/theme/tokens';

/** Uma capa de fixture: blocos de cor num RGBA bruto (o que o servidor entrega ao motor depois de reduzir a imagem). */
type Block = { rgb: readonly [number, number, number]; share: number };

function coverPixels(blocks: Block[], width = 48, height = 72): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const total = blocks.reduce((sum, block) => sum + block.share, 0);
  let index = 0;
  for (const block of blocks) {
    const count = Math.round((block.share / total) * width * height);
    for (let i = 0; i < count && index < width * height; i += 1, index += 1) {
      rgba.set([...block.rgb, 255], index * 4);
    }
  }
  while (index < width * height) {
    rgba.set([...blocks[0]!.rgb, 255], index * 4);
    index += 1;
  }
  return rgba;
}

export type ThemeFixture = { name: string; tokens: Record<string, string> | null };

function derive(blocks: Block[]): Record<string, string> {
  const palette = extractPalette(coverPixels(blocks), 48, 72);
  const derived = deriveTheme(palette);
  if (!derived) throw new Error('o motor de temas não derivou um tema da capa de fixture');
  return tokensToStyle(derived.tokens as ThemeTokens);
}

/** #CD7A45 em 205,122,69: o destaque laranja pedido; o resto é a sombra e o creme de uma capa comum. */
const ORANGE: Block[] = [
  { rgb: [205, 122, 69], share: 0.55 },
  { rgb: [92, 48, 28], share: 0.25 },
  { rgb: [240, 214, 180], share: 0.2 },
];

/** Azul escuro de capa noturna, com um brilho azul mais claro. */
const NAVY: Block[] = [
  { rgb: [16, 32, 74], share: 0.6 },
  { rgb: [38, 78, 150], share: 0.25 },
  { rgb: [12, 18, 40], share: 0.15 },
];

/** Os três temas: o padrão rosa (nenhum token no `<html>`) e dois derivados pelo motor. */
export const THEMES: ThemeFixture[] = [
  { name: 'rosa padrão', tokens: null },
  { name: 'laranja', tokens: derive(ORANGE) },
  { name: 'azul escuro', tokens: derive(NAVY) },
];
