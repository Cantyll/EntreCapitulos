import { describe, expect, it } from 'vitest';

import {
  MIN_SEGMENT_PX,
  STRIP_WIDTH_STEPS,
  buildStripBlocks,
  chapterModeStep,
  requiredStripWidth,
} from './layout';
import { buildChapterStrip } from './strip';

const sessionsOf = (size: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    chapterFrom: i * size + 1,
    chapterTo: (i + 1) * size,
  }));

describe('largura necessária da fita', () => {
  it('3px por capítulo mais os vãos', () => {
    expect(requiredStripWidth(0, 1)).toBe(0);
    expect(requiredStripWidth(1, 1)).toBe(3);
    expect(requiredStripWidth(12, 1)).toBe(12 * 3 + 11);
    expect(requiredStripWidth(50, 1)).toBe(199);
    expect(requiredStripWidth(300, 1)).toBe(1199);
    expect(requiredStripWidth(50, 2)).toBe(248);
  });

  it('a escada é crescente', () => {
    expect([...STRIP_WIDTH_STEPS]).toEqual([...STRIP_WIDTH_STEPS].sort((a, b) => a - b));
  });

  it.each([
    [1, 1],
    [12, 1],
    [50, 1],
    [300, 1],
    [50, 2],
  ])('total %i, vão %ipx: o degrau escolhido comporta e o anterior não', (total, gap) => {
    const step = chapterModeStep(total, gap);
    expect(step).not.toBeNull();
    const need = requiredStripWidth(total, gap);
    expect(STRIP_WIDTH_STEPS[step!]).toBeGreaterThanOrEqual(need);
    if (step! > 0) expect(STRIP_WIDTH_STEPS[step! - 1]).toBeLessThan(need);
  });

  it('um livro grande demais para qualquer degrau só tem a fita por sessão', () => {
    expect(chapterModeStep(301, 1)).toBeNull();
    expect(chapterModeStep(1000, 1)).toBeNull();
  });

  it('o degrau de 300 capítulos não cabe numa lateral de 250px, o de 12 cabe', () => {
    expect(STRIP_WIDTH_STEPS[chapterModeStep(12, 1)!]).toBeLessThanOrEqual(250);
    expect(STRIP_WIDTH_STEPS[chapterModeStep(300, 1)!]).toBeGreaterThan(250);
  });
});

describe('blocos da fita por sessão', () => {
  it.each([1, 12, 50, 300])(
    'total %i com a sessão 1 e o capítulo atual 3: 3 blocos no máximo',
    (total) => {
      const strip = buildChapterStrip({
        total,
        current: Math.min(3, total),
        sessions: [{ number: 1, chapterFrom: 1, chapterTo: Math.min(3, total) }],
      });
      const blocks = buildStripBlocks(strip);
      expect(blocks.reduce((sum, b) => sum + b.span, 0)).toBe(total);
      // sessão 1, próxima sessão (3 capítulos) e UMA trilha para o resto
      expect(blocks.length).toBeLessThanOrEqual(3);
      expect(blocks.filter((b) => b.kind === 'unread').length).toBeLessThanOrEqual(1);
    },
  );

  it('50 capítulos, atual 3: sessão 1 (link), próxima e uma trilha contínua', () => {
    const strip = buildChapterStrip({
      total: 50,
      current: 3,
      sessions: [{ number: 1, chapterFrom: 1, chapterTo: 3 }],
    });
    const blocks = buildStripBlocks(strip);
    expect(blocks.map((b) => [b.kind, b.from, b.to, b.span])).toEqual([
      ['last', 1, 3, 3],
      ['next', 4, 6, 3],
      ['unread', 7, 50, 44],
    ]);
    expect(blocks[0]!.ariaLabel).toBe('Sessão 1, capítulos 1 a 3');
    expect(blocks[1]!.ariaLabel).toBeNull();
  });

  it('300 capítulos e 100 sessões: um bloco por sessão, e cada um fica com 3px ou mais', () => {
    const strip = buildChapterStrip({ total: 300, current: 300, sessions: sessionsOf(3, 100) });
    const blocks = buildStripBlocks(strip);
    expect(blocks).toHaveLength(100);
    expect(blocks.at(-1)!.kind).toBe('last');
    // 100 blocos × 3px + 99 vãos de 1px cabe numa lateral de 400px
    expect(blocks.length * MIN_SEGMENT_PX + (blocks.length - 1)).toBeLessThanOrEqual(400);
  });

  it('sessões diferentes lado a lado ficam em blocos separados e alternam o tom', () => {
    const strip = buildChapterStrip({ total: 12, current: 12, sessions: sessionsOf(3, 4) });
    const blocks = buildStripBlocks(strip);
    expect(blocks.map((b) => b.tone)).toEqual([1, 0, 1, 0]);
    expect(blocks.map((b) => b.ariaLabel)).toEqual([
      'Sessão 1, capítulos 1 a 3',
      'Sessão 2, capítulos 4 a 6',
      'Sessão 3, capítulos 7 a 9',
      'Sessão 4, capítulos 10 a 12',
    ]);
  });

  it('sessão de um capítulo só usa o singular', () => {
    const strip = buildChapterStrip({
      total: 5,
      current: 1,
      sessions: [{ number: 1, chapterFrom: 1, chapterTo: 1 }],
    });
    expect(buildStripBlocks(strip)[0]!.ariaLabel).toBe('Sessão 1, capítulo 1');
  });

  it('sem sessões: lido sem link, próxima e trilha; total 1 vira um bloco só', () => {
    const none = buildChapterStrip({ total: 20, current: 2, sessions: [] });
    expect(buildStripBlocks(none).map((b) => b.kind)).toEqual(['read', 'next', 'unread']);
    const one = buildChapterStrip({ total: 1, current: 0, sessions: [] });
    expect(buildStripBlocks(one).map((b) => [b.kind, b.span])).toEqual([['next', 1]]);
  });

  it('capítulo atual 0 e atual igual ao total', () => {
    const start = buildChapterStrip({ total: 10, current: 0, sessions: [] });
    expect(buildStripBlocks(start).map((b) => b.kind)).toEqual(['next', 'unread']);
    const done = buildChapterStrip({ total: 10, current: 10, sessions: [] });
    expect(buildStripBlocks(done).map((b) => b.kind)).toEqual(['read']);
  });

  it('um intervalo sem sessão entre duas sessões vira um bloco lido', () => {
    const strip = buildChapterStrip({
      total: 12,
      current: 12,
      sessions: [
        { number: 1, chapterFrom: 1, chapterTo: 3 },
        { number: 2, chapterFrom: 7, chapterTo: 9 },
      ],
    });
    expect(buildStripBlocks(strip).map((b) => [b.kind, b.from, b.to])).toEqual([
      ['session', 1, 3],
      ['read', 4, 6],
      ['last', 7, 9],
      ['read', 10, 12],
    ]);
  });
});
