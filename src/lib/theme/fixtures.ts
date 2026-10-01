/** Imagens de teste geradas por código (RGBA bruto), sem arquivos. Só usado pelos testes. */
export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

export function image(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly [number, number, number, number?],
): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = pixel(x, y);
      data.set([r, g, b, a], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

export const solid = (rgb: readonly [number, number, number], w = 96, h = 144) =>
  image(w, h, () => rgb);

/** PRNG determinístico (mulberry32) para as propriedades e para ruído. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Capa "de livro": fundo colorido com faixas, miolo e margem branca (fundo de foto 3D). */
export function coverLike(
  colors: readonly (readonly [number, number, number])[],
  margin = 6,
  w = 96,
  h = 144,
): Rgba {
  return image(w, h, (x, y) => {
    if (x < margin || y < margin || x >= w - margin || y >= h - margin) return [255, 255, 255];
    return colors[
      Math.min(colors.length - 1, Math.floor(((y - margin) / (h - 2 * margin)) * colors.length))
    ]!;
  });
}
