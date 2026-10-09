/*
 * Traços "a lápis" da página Sobre (sublinhado, círculo e seta), como funções PURAS: recebem medidas e devolvem o
 * atributo `d` de um `<path>` SVG. Quem mede e desenha é `PencilMarks` (no navegador). O tremor da mão vem de um
 * gerador pseudoaleatório com semente: o mesmo trecho sai sempre com o mesmo traço (nada de traço que muda a cada
 * rolagem ou redimensionamento).
 */

export type Rng = () => number;

/** mulberry32: pequeno, rápido e determinístico. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semente estável a partir de um texto (FNV-1a). */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Valor entre -1 e 1. */
const wobble = (rng: Rng) => rng() * 2 - 1;

/**
 * Sublinhado de uma linha de texto: começa um pouco antes, sobe de leve no fim (a mão sobe) e, se a linha for longa,
 * volta num segundo passe mais curto, como quem reforça o traço.
 */
export function underlinePath(x: number, y: number, width: number, rng: Rng): string {
  const w = Math.max(width, 8);
  const start = x - 2 - rng() * 3;
  const end = x + w + 1 + rng() * 3;
  const rise = Math.min(4, w / 60) + rng() * 1.5;
  const y0 = y + wobble(rng) * 0.8;
  const y1 = y0 - rise;
  const c1x = start + (end - start) * 0.33;
  const c2x = start + (end - start) * 0.66;
  let d = `M${r1(start)} ${r1(y0)} C${r1(c1x)} ${r1(y0 + 1.6 + wobble(rng))} ${r1(c2x)} ${r1(y1 - 1 + wobble(rng))} ${r1(end)} ${r1(y1)}`;
  if (w > 90) {
    const back = start + (end - start) * (0.12 + rng() * 0.1);
    const yb = y0 + 3.2 + wobble(rng) * 0.6;
    d += ` Q${r1((end + back) / 2)} ${r1(yb + 1.4)} ${r1(back)} ${r1(yb)}`;
  }
  return d;
}

/**
 * Círculo à mão em volta de uma caixa: uma elipse que não fecha certinho (passa um pouco do ponto de partida), com o
 * raio variando a cada volta.
 */
export function circlePath(cx: number, cy: number, rx: number, ry: number, rng: Rng): string {
  const steps = 26;
  const turn = 1.12 + rng() * 0.08;
  const a0 = -2.2 + wobble(rng) * 0.4;
  const tilt = wobble(rng) * 0.08;
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + t * turn * Math.PI * 2;
    // O traço começa mais aberto e fecha um pouco mais justo (como a mão que volta ao ponto de partida).
    const k = 1.06 - 0.1 * t + wobble(rng) * 0.025;
    const px = Math.cos(a) * rx * k;
    const py = Math.sin(a) * ry * k;
    points.push([
      cx + px * Math.cos(tilt) - py * Math.sin(tilt),
      cy + px * Math.sin(tilt) + py * Math.cos(tilt),
    ]);
  }
  return smooth(points);
}

/**
 * Seta curva de `from` até `to`, com a ponta em dois riscos. `bend` positivo curva para a esquerda do caminho.
 */
export function arrowPath(
  from: readonly [number, number],
  to: readonly [number, number],
  bend: number,
  rng: Rng,
): string {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const b = bend * len + wobble(rng) * 4;
  const cx = (x0 + x1) / 2 + nx * b;
  const cy = (y0 + y1) / 2 + ny * b;
  // A ponta segue a tangente do fim da curva.
  const tx = x1 - cx;
  const ty = y1 - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const head = 9 + rng() * 2;
  const spread = 0.5;
  const h1: [number, number] = [
    x1 - head * (ux * Math.cos(spread) - uy * Math.sin(spread)),
    y1 - head * (uy * Math.cos(spread) + ux * Math.sin(spread)),
  ];
  const h2: [number, number] = [
    x1 - head * (ux * Math.cos(-spread) - uy * Math.sin(-spread)),
    y1 - head * (uy * Math.cos(-spread) + ux * Math.sin(-spread)),
  ];
  return (
    `M${r1(x0)} ${r1(y0)} Q${r1(cx)} ${r1(cy)} ${r1(x1)} ${r1(y1)}` +
    ` M${r1(h1[0])} ${r1(h1[1])} L${r1(x1)} ${r1(y1)} L${r1(h2[0])} ${r1(h2[1])}`
  );
}

/** Curva suave (Catmull-Rom convertida em Bézier) pelos pontos. */
function smooth(points: readonly (readonly [number, number])[]): string {
  if (points.length < 2) return '';
  const [first] = points;
  let d = `M${r1(first![0])} ${r1(first![1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

/** Ritmo da escrita do título: milissegundos por letra, e uma pausa curta entre as palavras. */
export const TITLE_PACE = { perChar: 55, gap: 70, start: 250 } as const;

export type TitleWord = { text: string; delay: number; duration: number };

/**
 * Divide o título em palavras e calcula quando cada uma começa a ser "escrita" e quanto demora. Os espaços entre as
 * palavras são devolvidos à parte por quem desenha (o texto do `<h1>` continua idêntico). Títulos longos andam mais
 * depressa, para a escrita nunca passar de ~1,8 s.
 */
export function titleWords(title: string): { words: TitleWord[]; total: number } {
  const parts = title.split(/\s+/).filter((w) => w !== '');
  const chars = parts.reduce((n, w) => n + [...w].length, 0);
  const budget = 1800 - TITLE_PACE.start;
  const natural = chars * TITLE_PACE.perChar + Math.max(0, parts.length - 1) * TITLE_PACE.gap;
  const k = natural > budget ? budget / natural : 1;
  let t = TITLE_PACE.start;
  const words = parts.map((text) => {
    const duration = Math.round([...text].length * TITLE_PACE.perChar * k);
    const word = { text, delay: Math.round(t), duration };
    t += duration + TITLE_PACE.gap * k;
    return word;
  });
  return { words, total: Math.round(t) };
}

/** Destaque curto (até duas palavras e 16 letras) ganha círculo; o resto, sublinhado. */
export function markKind(text: string): 'circle' | 'underline' {
  const clean = text.trim();
  return clean.split(/\s+/).length <= 2 && [...clean].length <= 16 ? 'circle' : 'underline';
}
