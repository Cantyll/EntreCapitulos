import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { contrast } from '@/lib/theme/color';
import { deriveTheme } from '@/lib/theme/derive';
import { coverLike } from '@/lib/theme/fixtures';
import { extractPalette } from '@/lib/theme/palette';

import { buildChapterStrip, nextChapterRange, segmentLabel, type StripSession } from './strip';

const s = (number: number, chapterFrom: number, chapterTo: number): StripSession => ({
  number,
  chapterFrom,
  chapterTo,
});
const kinds = (strip: ReturnType<typeof buildChapterStrip>) => strip.segments.map((x) => x.kind);

describe('nextChapterRange', () => {
  it.each([
    [12, 52, { from: 13, to: 15 }],
    [0, 52, { from: 1, to: 3 }],
    [50, 52, { from: 51, to: 52 }],
    [51, 52, { from: 52, to: 52 }],
    [52, 52, null],
    [60, 52, null],
    [0, 1, { from: 1, to: 1 }],
    [0, 0, null],
  ])('atual %i de %i → %j', (current, total, expected) => {
    expect(nextChapterRange(current, total)).toEqual(expected);
  });
});

describe('buildChapterStrip', () => {
  it('o caso do seed: 52 capítulos, atual 12, sessões 1–4', () => {
    const strip = buildChapterStrip({
      total: 52,
      current: 12,
      sessions: [s(1, 1, 3), s(2, 4, 6), s(3, 7, 9), s(4, 10, 12)],
    });
    expect(strip.segments).toHaveLength(52);
    expect(kinds(strip).slice(0, 12)).toEqual([
      ...Array(9).fill('session'),
      ...Array(3).fill('last'),
    ]);
    expect(kinds(strip).slice(12, 15)).toEqual(['next', 'next', 'next']);
    expect(
      kinds(strip)
        .slice(15)
        .every((k) => k === 'unread'),
    ).toBe(true);
    expect(strip.last?.number).toBe(4);
    expect(strip.nextRange).toEqual({ from: 13, to: 15 });
    expect(strip.labels.map((l) => [l.text, l.kind, l.from, l.to])).toEqual([
      ['S1', 'session', 1, 3],
      ['S2', 'session', 4, 6],
      ['S3', 'session', 7, 9],
      ['S4', 'last', 10, 12],
      ['próx.', 'next', 13, 15],
    ]);
  });

  it('sem sessões: o que já foi lido aparece como lido, sem link', () => {
    const strip = buildChapterStrip({ total: 10, current: 4, sessions: [] });
    expect(kinds(strip)).toEqual([
      'read',
      'read',
      'read',
      'read',
      'next',
      'next',
      'next',
      'unread',
      'unread',
      'unread',
    ]);
    expect(strip.segments.every((x) => x.session === undefined)).toBe(true);
    expect(strip.last).toBeNull();
    expect(strip.labels).toEqual([{ kind: 'next', text: 'próx.', from: 5, to: 7 }]);
  });

  it('total 1', () => {
    expect(kinds(buildChapterStrip({ total: 1, current: 0, sessions: [] }))).toEqual(['next']);
    expect(kinds(buildChapterStrip({ total: 1, current: 1, sessions: [] }))).toEqual(['read']);
    expect(kinds(buildChapterStrip({ total: 1, current: 1, sessions: [s(1, 1, 1)] }))).toEqual([
      'last',
    ]);
  });

  it('atual 0: tudo por ler e a próxima sessão são os 3 primeiros', () => {
    const strip = buildChapterStrip({ total: 6, current: 0, sessions: [] });
    expect(kinds(strip)).toEqual(['next', 'next', 'next', 'unread', 'unread', 'unread']);
  });

  it('atual = total: nada de próxima sessão', () => {
    const strip = buildChapterStrip({ total: 5, current: 5, sessions: [s(1, 1, 2)] });
    expect(kinds(strip)).toEqual(['last', 'last', 'read', 'read', 'read']);
    expect(strip.nextRange).toBeNull();
    expect(strip.labels.some((l) => l.kind === 'next')).toBe(false);
  });

  it('atual acima do total é limitado ao total', () => {
    const strip = buildChapterStrip({ total: 3, current: 9, sessions: [] });
    expect(kinds(strip)).toEqual(['read', 'read', 'read']);
  });

  it('lacunas: capítulo lido sem sessão visível fica entre sessões, sem link', () => {
    const strip = buildChapterStrip({ total: 12, current: 9, sessions: [s(1, 1, 3), s(3, 7, 9)] });
    expect(kinds(strip).slice(0, 9)).toEqual([
      'session',
      'session',
      'session',
      'read',
      'read',
      'read',
      'last',
      'last',
      'last',
    ]);
    expect(strip.segments[3]!.session).toBeUndefined();
  });

  it('a sessão mais recente é a de maior número, não a de maior capítulo', () => {
    const strip = buildChapterStrip({ total: 10, current: 6, sessions: [s(2, 1, 3), s(1, 4, 6)] });
    expect(strip.last?.number).toBe(2);
    expect(strip.segments[0]!.kind).toBe('last');
    expect(strip.segments[3]!.kind).toBe('session');
  });

  it('uma sessão por cima da próxima sessão vence, e o rótulo "próx." só cobre o que sobra', () => {
    const strip = buildChapterStrip({ total: 20, current: 5, sessions: [s(1, 1, 5), s(2, 7, 7)] });
    expect(strip.segments[5]!.kind).toBe('next'); // capítulo 6
    expect(strip.segments[6]!.kind).toBe('last'); // capítulo 7 tem sessão
    expect(strip.segments[7]!.kind).toBe('next'); // capítulo 8
    expect(strip.nextRange).toEqual({ from: 6, to: 8 });
  });

  it('sessão além do total do livro é cortada; a que começa além dele some', () => {
    const strip = buildChapterStrip({ total: 4, current: 4, sessions: [s(1, 3, 9), s(2, 6, 8)] });
    expect(strip.segments).toHaveLength(4);
    expect(strip.segments[3]!.session?.number).toBe(1);
    expect(strip.labels.map((l) => l.text)).toEqual(['S1']);
  });

  it('sessão sobreposta: a primeira (menor número) fica com o capítulo', () => {
    const strip = buildChapterStrip({ total: 6, current: 6, sessions: [s(1, 1, 4), s(2, 3, 6)] });
    expect(strip.segments[2]!.session?.number).toBe(1);
    expect(strip.segments[4]!.session?.number).toBe(2);
  });

  it('total zero ou negativo: fita vazia', () => {
    expect(buildChapterStrip({ total: 0, current: 0, sessions: [] }).segments).toEqual([]);
    expect(buildChapterStrip({ total: -3, current: 0, sessions: [] }).segments).toEqual([]);
  });

  it('o tom alterna entre sessões ímpares e pares', () => {
    const strip = buildChapterStrip({
      total: 6,
      current: 6,
      sessions: [s(1, 1, 2), s(2, 3, 4), s(3, 5, 6)],
    });
    expect(strip.segments.map((x) => x.tone)).toEqual([1, 1, 0, 0, 1, 1]);
  });
});

describe('segmentLabel', () => {
  const strip = buildChapterStrip({ total: 8, current: 3, sessions: [s(4, 1, 2)] });
  it('cada estado diz o que é, sem depender da cor', () => {
    expect(segmentLabel(strip.segments[0]!)).toBe('Capítulo 1, sessão 4');
    expect(segmentLabel(strip.segments[2]!)).toBe('Capítulo 3, lido');
    expect(segmentLabel(strip.segments[3]!)).toBe('Capítulo 4, próxima sessão');
    expect(segmentLabel(strip.segments[7]!)).toBe('Capítulo 8, ainda não lido');
  });
});

describe('contraste dos elementos gráficos da fita (≥ 3:1)', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))![1]!;
  const defaults = Object.fromEntries(
    ['bg', 'surface', 'rose', 'rose-2', 'rose-deep'].map((n) => [n, token(n)]),
  );

  const themed = [
    [[200, 80, 120]],
    [[40, 120, 200]],
    [[200, 160, 40]],
    [[60, 150, 90]],
    [[230, 150, 190]],
  ].map(([c]) =>
    deriveTheme(
      extractPalette(coverLike([c as [number, number, number], [60, 40, 50]]).data, 96, 144),
    ),
  );

  const palettes: [string, Record<string, string>][] = [
    ['tema padrão', defaults],
    ...themed.flatMap((t, i): [string, Record<string, string>][] =>
      t
        ? [
            [
              `tema de capa ${i + 1}`,
              Object.fromEntries(
                Object.entries(t.tokens).map(([k, v]) => [k.replace(/^--/, ''), v as string]),
              ),
            ],
          ]
        : [],
    ),
  ];

  it('há temas de capa para conferir', () => {
    expect(palettes.length).toBeGreaterThan(2);
  });

  it.each(palettes)(
    '%s: cheio (sessão), mais escuro (última) e contorno contra o fundo',
    (_n, t) => {
      // --rose: sessões e contorno da próxima; --rose-deep: a última. A trilha "por ler" (--line-2) é
      // decorativa por pedido do protótipo: a legenda e os rótulos dizem o estado.
      expect(contrast(t['rose']!, t.bg!)).toBeGreaterThanOrEqual(3);
      expect(contrast(t['rose-deep']!, t.bg!)).toBeGreaterThanOrEqual(3);
      expect(contrast(t['rose']!, t.surface!)).toBeGreaterThanOrEqual(3);
    },
  );
});
