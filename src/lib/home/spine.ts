/*
 * As lombadas da estante da home: cada livro terminado vira uma lombada em pé. Altura e largura variam um pouco,
 * como numa estante de verdade, mas a partir do título (o mesmo livro sempre tem a mesma lombada). Puro e testado.
 */

/** FNV-1a: semente estável a partir de um texto. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const SPINE_HEIGHTS = [204, 218, 232, 246] as const;
export const SPINE_WIDTHS = [48, 52, 56] as const;
/** Tamanho do título até este número de caracteres; acima, encolhe (até `SPINE_MIN_FONT`). */
export const SPINE_FULL_CHARS = 22;
export const SPINE_FONT = 17;
export const SPINE_MIN_FONT = 13;

export type Spine = { height: number; width: number; fontSize: number };

export function spineFor(title: string): Spine {
  const h = hash(title.trim());
  const length = [...title.trim()].length;
  const fontSize =
    length <= SPINE_FULL_CHARS
      ? SPINE_FONT
      : Math.max(SPINE_MIN_FONT, Math.round(SPINE_FONT * Math.sqrt(SPINE_FULL_CHARS / length)));
  return {
    height: SPINE_HEIGHTS[h % SPINE_HEIGHTS.length]!,
    width: SPINE_WIDTHS[(h >>> 8) % SPINE_WIDTHS.length]!,
    fontSize,
  };
}
