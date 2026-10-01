import { rgbToHex, rgbToHsl, type Rgb } from './color';

export type PaletteColor = {
  hex: string;
  /** Participação na capa (0 a 1), só contando pixels que não são fundo. */
  share: number;
  h: number;
  s: number;
  l: number;
};

/** Menos que isto de pixels úteis (nem transparentes nem quase brancos) não dá paleta. */
const MIN_PIXELS = 60;

/**
 * Extrai a paleta de uma imagem já reduzida (~96 px de largura), em RGBA bruto. Ignora pixels
 * transparentes e quase brancos (fundo de foto 3D) e agrupa o resto com k-means. Determinístico:
 * sem sorteio, e os desempates seguem a ordem dos pixels. Devolve as cores da mais para a menos
 * presente, ou `null` se sobrarem pixels de menos.
 */
export function extractPalette(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  k = 7,
): PaletteColor[] | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  if (rgba.length !== width * height * 4 || k < 3) return null;

  const px: Rgb[] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < 200) continue;
    if (Math.min(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!) > 243) continue;
    px.push([rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
  }
  if (px.length < MIN_PIXELS) return null;

  const sat = px.map((p) => rgbToHsl(p)[1]);
  const order = px.map((_, i) => i);
  const byL = order.slice().sort((a, b) => sum(px[a]!) - sum(px[b]!) || a - b);
  const bySat = order.slice().sort((a, b) => sat[b]! - sat[a]! || a - b);

  let cents: number[][] = [];
  for (let i = 0; i < k - 2; i++) {
    cents.push([...px[byL[Math.floor(((i + 0.5) * byL.length) / (k - 2))]!]!]);
  }
  cents.push([...px[bySat[0]!]!], [...px[bySat[Math.floor(bySat.length * 0.05)]!]!]);

  const assign = new Array<number>(px.length).fill(0);
  for (let iteration = 0; iteration < 14; iteration++) {
    const acc = cents.map(() => [0, 0, 0, 0]);
    px.forEach((p, i) => {
      let best = 0;
      let bestDistance = Infinity;
      for (let j = 0; j < cents.length; j++) {
        const c = cents[j]!;
        // Pesos de percepção (verde pesa mais que azul).
        const d =
          (p[0] - c[0]!) ** 2 * 0.3 + (p[1] - c[1]!) ** 2 * 0.59 + (p[2] - c[2]!) ** 2 * 0.11;
        if (d < bestDistance) {
          bestDistance = d;
          best = j;
        }
      }
      assign[i] = best;
      const a = acc[best]!;
      a[0]! += p[0];
      a[1]! += p[1];
      a[2]! += p[2];
      a[3]!++;
    });
    cents = cents.map((c, j) => {
      const a = acc[j]!;
      return a[3]! ? [a[0]! / a[3]!, a[1]! / a[3]!, a[2]! / a[3]!] : c;
    });
  }

  const counts = cents.map(() => 0);
  assign.forEach((a) => counts[a]!++);

  return cents
    .map((c, j) => {
      const rgb = c as unknown as Rgb;
      const [h, s, l] = rgbToHsl(rgb);
      return { hex: rgbToHex(rgb), share: counts[j]! / px.length, h, s, l };
    })
    .filter((c) => c.share > 0.01)
    .sort((a, b) => b.share - a.share);
}

const sum = (p: Rgb) => p[0] + p[1] + p[2];
