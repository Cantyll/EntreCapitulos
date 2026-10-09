import { describe, expect, it } from 'vitest';

import { defaultAbout } from './defaults';
import {
  arrowPath,
  circlePath,
  markKind,
  seededRng,
  seedFrom,
  titleWords,
  underlinePath,
} from './pencil';

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('traços a lápis', () => {
  it('o mesmo trecho sai sempre com o mesmo traço', () => {
    const a = underlinePath(10, 40, 200, seededRng(seedFrom('Oi')));
    const b = underlinePath(10, 40, 200, seededRng(seedFrom('Oi')));
    const c = underlinePath(10, 40, 200, seededRng(seedFrom('Olá')));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('o sublinhado fica junto da linha e não passa muito das pontas', () => {
    const d = underlinePath(100, 50, 240, seededRng(1));
    expect(d.startsWith('M')).toBe(true);
    const ns = numbers(d);
    const xs = ns.filter((_, i) => i % 2 === 0);
    const ys = ns.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(94);
    expect(Math.max(...xs)).toBeLessThanOrEqual(345);
    expect(Math.min(...ys)).toBeGreaterThan(40);
    expect(Math.max(...ys)).toBeLessThan(60);
  });

  it('sublinhado curto não ganha o segundo passe', () => {
    expect(underlinePath(0, 0, 40, seededRng(2))).not.toContain('Q');
    expect(underlinePath(0, 0, 200, seededRng(2))).toContain('Q');
  });

  it('o círculo envolve a caixa', () => {
    const ns = numbers(circlePath(50, 50, 20, 14, seededRng(3)));
    const xs = ns.filter((_, i) => i % 2 === 0);
    const ys = ns.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeLessThan(35);
    expect(Math.max(...xs)).toBeGreaterThan(65);
    expect(Math.min(...ys)).toBeLessThan(40);
    expect(Math.max(...ys)).toBeGreaterThan(60);
    expect(ns.every(Number.isFinite)).toBe(true);
  });

  it('a seta termina no destino, com a ponta em dois riscos', () => {
    const d = arrowPath([0, 100], [80, 0], -0.4, seededRng(4));
    expect(d).toMatch(/^M0 100 Q[-\d.]+ [-\d.]+ 80 0 M[-\d.]+ [-\d.]+ L80 0 L[-\d.]+ [-\d.]+$/);
  });

  it('a seta com origem e destino iguais não gera NaN', () => {
    expect(arrowPath([5, 5], [5, 5], 0.3, seededRng(5))).not.toContain('NaN');
  });
});

describe('titleWords', () => {
  it('cada palavra começa depois da anterior terminar', () => {
    const { words, total } = titleWords('Oi, eu sou a Agatha.');
    expect(words.map((w) => w.text)).toEqual(['Oi,', 'eu', 'sou', 'a', 'Agatha.']);
    for (let i = 1; i < words.length; i++) {
      expect(words[i]!.delay).toBeGreaterThanOrEqual(words[i - 1]!.delay + words[i - 1]!.duration);
    }
    expect(total).toBeGreaterThan(words.at(-1)!.delay);
  });

  it('título longo nunca passa de ~1,8 s', () => {
    const { total } = titleWords('palavra '.repeat(30));
    expect(total).toBeLessThanOrEqual(1850);
  });

  it('espaços sobrando não viram palavra vazia', () => {
    expect(titleWords('  Oi   você  ').words.map((w) => w.text)).toEqual(['Oi', 'você']);
    expect(titleWords('').words).toEqual([]);
  });
});

describe('markKind', () => {
  it('destaque curto ganha círculo e longo ganha sublinhado', () => {
    expect(markKind('spoiler')).toBe('circle');
    expect(markKind('sem medo')).toBe('circle');
    expect(markKind('sem medo de spoiler')).toBe('underline');
    expect(markKind('anotadoracompulsiva')).toBe('underline');
  });
});

describe('ênfases do texto padrão', () => {
  it('as palavras do texto padrão não mudam com o itálico e o negrito', async () => {
    const { SOBRE } = await import('@/content/sobre');
    const intro = defaultAbout().intro;
    const texts = (intro.content ?? []).map((block) =>
      block.type === 'paragraph'
        ? (block.content ?? []).map((n) => ('text' in n ? n.text : '')).join('')
        : '',
    );
    expect(texts).toEqual([SOBRE.lead, ...SOBRE.paragraphs]);
    const marked = (intro.content ?? []).flatMap((block) =>
      block.type === 'paragraph'
        ? (block.content ?? []).flatMap((n) =>
            'marks' in n && n.marks ? [`${n.marks[0]!.type}:${n.text}`] : [],
          )
        : [],
    );
    expect(marked).toEqual(SOBRE.emphasis.map((e) => `${e.mark}:${e.text}`));
  });
});
