import { describe, expect, it } from 'vitest';

import { TOUR_CHAPTERS, TOUR_STEPS } from '@/content/tour/steps';
import { TOUR_VERSION } from '@/content/tour/version';

import {
  INTENT_MAX_AGE_MS,
  TOUR_STORAGE_KEY,
  buildRun,
  chaptersFor,
  chaptersForPath,
  classifyTourError,
  continueTour,
  currentStep,
  hasNews,
  intentMatches,
  isValidRun,
  nextStep,
  parseTourStorage,
  parseTutorialParam,
  clipToView,
  placeCard,
  previousStep,
  progress,
  runAllowedFor,
  scrollArea,
  scrollDelta,
  serializeTourStorage,
  shouldOfferTour,
  tutorialHref,
  type TourContext,
} from './index';

const admin: TourContext = { role: 'admin', iosSafariOutsideApp: false };
const moderator: TourContext = { role: 'moderator', iosSafariOutsideApp: false };

describe('definição dos passos', () => {
  it('os capítulos seguem a numeração da etapa 8k', () => {
    expect(TOUR_CHAPTERS.map((c) => `${c.number} ${c.id}`)).toEqual([
      '1 navegacao',
      '2 livros',
      '3 sessoes',
      '4 editor',
      '5 publicar',
      '6 comentarios',
      '7 membros',
      '8 sobre',
      '9 leitoras',
      '10 conta',
    ]);
  });

  it('ids únicos, textos curtos, `since` válido e alvos por data-tour', () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of TOUR_STEPS) {
      expect(step.id, step.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(step.title.length, `${step.id}: título`).toBeLessThanOrEqual(60);
      expect(step.body.length, `${step.id}: texto`).toBeLessThanOrEqual(280);
      expect(step.body.trim().length, `${step.id}: texto vazio`).toBeGreaterThan(0);
      expect(Number.isInteger(step.since) && step.since >= 1, `${step.id}: since`).toBe(true);
      expect(step.since, `${step.id}: since acima da versão`).toBeLessThanOrEqual(TOUR_VERSION);
      expect(
        TOUR_CHAPTERS.some((c) => c.id === step.chapter),
        `${step.id}: capítulo`,
      ).toBe(true);
      if (step.target !== undefined) expect(step.target, step.id).toMatch(/^[a-z][a-z0-9-]*$/);
      if (step.kind === 'go') expect(step.route, `${step.id}: go sem rota`).toBeDefined();
      if (step.route !== undefined) expect(step.route, step.id).toMatch(/^\/painel(\/|$)/);
    }
  });

  it('todo capítulo tem passo, e os passos de um capítulo ficam juntos', () => {
    for (const chapter of TOUR_CHAPTERS) {
      expect(
        TOUR_STEPS.some((s) => s.chapter === chapter.id),
        chapter.id,
      ).toBe(true);
    }
    const order = TOUR_STEPS.map((s) => s.chapter);
    const firstSeen = TOUR_CHAPTERS.map((c) => order.indexOf(c.id));
    expect([...firstSeen].sort((a, b) => a - b)).toEqual(firstSeen);
  });

  it('nenhum texto convida a criar, publicar, aprovar, suspender ou apagar (só explica)', () => {
    for (const step of TOUR_STEPS.filter((s) => s.kind === 'try')) {
      expect(step.body, step.id).toMatch(/^Experimente:/);
      expect(step.body, step.id).not.toMatch(
        /\b(publique|aprove|exclua|apague|suspenda|crie|salve)\b/i,
      );
    }
  });
});

describe('papéis', () => {
  it('a moderação só vê Comentários e Conta, e o tour dela não tem passo da administração', () => {
    expect(chaptersFor('moderator').map((c) => c.id)).toEqual(['comentarios', 'conta']);
    const tour = buildRun({ mode: 'full' }, moderator)!;
    const chapters = new Set(tour.steps.map((id) => TOUR_STEPS.find((s) => s.id === id)!.chapter));
    expect([...chapters]).toEqual(['comentarios', 'conta']);
    expect(buildRun({ mode: 'chapter', chapter: 'membros' }, moderator)).toBeNull();
    expect(buildRun({ mode: 'chapter', chapter: 'sobre' }, moderator)).toBeNull();
  });

  it('o último passo dos dois tours destaca o botão "?"', () => {
    for (const context of [admin, moderator]) {
      const tour = buildRun({ mode: 'full' }, context)!;
      const last = TOUR_STEPS.find((s) => s.id === tour.steps.at(-1))!;
      expect(last.target).toBe('help-button');
    }
  });

  it('o passo de instalação só aparece no Safari do iOS fora do app', () => {
    const outside = buildRun(
      { mode: 'chapter', chapter: 'conta' },
      { ...admin, iosSafariOutsideApp: true },
    )!;
    const elsewhere = buildRun({ mode: 'chapter', chapter: 'conta' }, admin)!;
    expect(outside.steps).toContain('conta-instalar');
    expect(elsewhere.steps).not.toContain('conta-instalar');
  });

  it('uma execução guardada não vale para quem perdeu o papel', () => {
    const tour = buildRun({ mode: 'full' }, admin)!;
    expect(runAllowedFor(tour, admin)).toBe(true);
    expect(runAllowedFor(tour, moderator)).toBe(false);
  });
});

describe('"Ajuda desta tela"', () => {
  it.each([
    ['/painel', ['navegacao']],
    ['/painel/livros', ['livros']],
    ['/painel/livros/novo', ['livros']],
    ['/painel/sessoes', ['sessoes']],
    ['/painel/sessoes/nova', ['editor', 'publicar']],
    ['/painel/sessoes/2f1d0c43-2b0b-4f5e-9c3e-0d3f4f1b2a10', ['editor', 'publicar']],
    ['/painel/comentarios', ['comentarios']],
    ['/painel/membros', ['membros']],
    ['/painel/membros/2f1d0c43-2b0b-4f5e-9c3e-0d3f4f1b2a10', ['membros']],
    ['/painel/sobre', ['sobre']],
    ['/conta', ['conta']],
    ['/painel/votacoes', null],
    ['/painel/configuracoes', null],
  ] as const)('%s', (pathname, expected) => {
    expect(chaptersForPath(pathname)).toEqual(expected);
  });

  it('tela sem capítulo próprio abre o tour completo', () => {
    expect(buildRun({ mode: 'screen', pathname: '/painel/votacoes' }, admin)).toEqual(
      buildRun({ mode: 'full' }, admin),
    );
  });

  it('a moderação numa tela da administração recebe o tour dela', () => {
    expect(buildRun({ mode: 'screen', pathname: '/painel/membros' }, moderator)?.mode).toBe('full');
  });

  it('ao fim da ajuda da tela, "Continuar o tour" segue do capítulo seguinte', () => {
    const screen = buildRun({ mode: 'screen', pathname: '/painel/sessoes/nova' }, admin)!;
    expect(screen.chapters).toEqual(['editor', 'publicar']);
    const rest = continueTour(screen, admin)!;
    expect(currentStep(rest).chapter).toBe('comentarios');
    const end = buildRun({ mode: 'chapter', chapter: 'conta' }, admin)!;
    expect(continueTour(end, admin)).toBeNull();
  });
});

describe('máquina de estados', () => {
  it('próximo, voltar e progresso', () => {
    const tour = buildRun({ mode: 'chapter', chapter: 'membros' }, admin)!;
    expect(progress(tour)).toMatchObject({ position: 1, chapter: { number: 7 } });
    const second = nextStep(tour)!;
    expect(second.index).toBe(1);
    expect(previousStep(second).index).toBe(0);
    expect(previousStep(tour).index).toBe(0);
    let last = tour;
    while (nextStep(last)) last = nextStep(last)!;
    expect(nextStep(last)).toBeNull();
    expect(progress(last).position).toBe(progress(last).total);
  });

  it('se viu, não mostra; leitura que falhou nunca mostra', () => {
    expect(shouldOfferTour(0)).toBe(true);
    expect(shouldOfferTour(1)).toBe(false);
    expect(shouldOfferTour(null)).toBe(false);
    expect(hasNews(null, 2)).toBe(false);
    expect(hasNews(0, 2)).toBe(false);
    expect(hasNews(1, 2)).toBe(true);
    expect(hasNews(2, 2)).toBe(false);
    expect(hasNews(TOUR_VERSION)).toBe(false);
  });

  it('Novidades: só os passos com `since` acima da versão vista', () => {
    expect(buildRun({ mode: 'news', seen: TOUR_VERSION }, admin)).toBeNull();
    expect(buildRun({ mode: 'news', seen: 0 }, admin)?.steps.length).toBe(
      buildRun({ mode: 'full' }, admin)?.steps.length,
    );
  });
});

describe('?tutorial= e a intenção do clique', () => {
  it('só aceita a lista fixa', () => {
    expect(parseTutorialParam('conta')).toBe('conta');
    for (const value of [
      '',
      'membros',
      'CONTA',
      'conta ',
      'toString',
      '__proto__',
      null,
      undefined,
    ]) {
      expect(parseTutorialParam(value)).toBeNull();
    }
    expect(tutorialHref('conta')).toBe('/painel?tutorial=conta');
  });

  it('o parâmetro sozinho não inicia nada: precisa da intenção recente do mesmo valor', () => {
    const now = 1_000_000;
    expect(intentMatches('conta', null, now)).toBe(false);
    expect(intentMatches(null, { value: 'conta', at: now }, now)).toBe(false);
    expect(intentMatches('conta', { value: 'conta', at: now - 1000 }, now)).toBe(true);
    expect(intentMatches('conta', { value: 'conta', at: now - INTENT_MAX_AGE_MS - 1 }, now)).toBe(
      false,
    );
    expect(intentMatches('conta', { value: 'conta', at: now + 5000 }, now)).toBe(false);
  });
});

describe('armazenamento da aba', () => {
  it('ida e volta, com leitura estrita', () => {
    expect(TOUR_STORAGE_KEY).toBe('ec:tour:v1');
    const run = buildRun({ mode: 'full' }, admin)!;
    const stored = { v: 1 as const, run, intent: { value: 'conta' as const, at: 5 } };
    expect(parseTourStorage(serializeTourStorage(stored))).toEqual(stored);
    for (const raw of [
      null,
      'não é json',
      '[]',
      '{"v":2}',
      '{"v":1,"extra":true}',
      JSON.stringify({ v: 1, run: { ...run, index: 999 } }),
      JSON.stringify({ v: 1, run: { ...run, steps: ['passo-que-nao-existe'] } }),
      JSON.stringify({ v: 1, intent: { value: 'membros', at: 1 } }),
    ]) {
      expect(parseTourStorage(raw)).toEqual({ v: 1 });
    }
    expect(isValidRun({ ...run, mode: 'outro' })).toBe(false);
  });
});

describe('erros de mark_tour_seen', () => {
  it('pelo prefixo primeiro, depois pelo código', () => {
    expect(classifyTourError({ code: '42501', message: 'not_staff: only the panel team' })).toBe(
      'not_staff',
    );
    expect(classifyTourError({ code: '42501', message: 'permission denied for function' })).toBe(
      'generic',
    );
    expect(classifyTourError({ code: '22023', message: 'invalid_version: x' })).toBe(
      'invalid_version',
    );
    expect(classifyTourError({ code: 'PGRST202', message: 'Could not find the function' })).toBe(
      'unavailable',
    );
    expect(classifyTourError({ code: '42703', message: 'column does not exist' })).toBe(
      'unavailable',
    );
    expect(classifyTourError({})).toBe('generic');
  });
});

describe('posição do cartão', () => {
  const view = { width: 1280, height: 800, headerBottom: 64 };
  const card = { width: 360, height: 220 };

  it('sem alvo: centralizado no computador, folha embaixo no celular', () => {
    expect(placeCard(null, card, view, false)).toEqual({ kind: 'center' });
    expect(placeCard(null, card, view, true)).toEqual({ kind: 'sheet', side: 'bottom' });
  });

  it('abaixo do alvo quando cabe, senão acima, sem cobrir o alvo e dentro da janela', () => {
    const target = { top: 120, left: 1200, width: 44, height: 44 };
    const below = placeCard(target, card, view, false);
    expect(below).toMatchObject({ kind: 'anchored', side: 'below' });
    if (below.kind !== 'anchored') throw new Error('anchored');
    expect(below.top).toBeGreaterThanOrEqual(target.top + target.height);
    expect(below.left + card.width).toBeLessThanOrEqual(view.width - 16);
    expect(below.arrowX).toBeGreaterThanOrEqual(20);
    expect(below.arrowX).toBeLessThanOrEqual(card.width - 20);

    const low = { top: 700, left: 100, width: 200, height: 60 };
    const above = placeCard(low, card, view, false);
    expect(above).toMatchObject({ kind: 'anchored', side: 'above' });
    if (above.kind !== 'anchored') throw new Error('anchored');
    expect(above.top + card.height).toBeLessThanOrEqual(low.top);
    expect(above.left).toBeGreaterThanOrEqual(16);
  });

  it('alvo alto demais: canto da janela', () => {
    expect(placeCard({ top: 70, left: 0, width: 900, height: 700 }, card, view, false)).toEqual({
      kind: 'corner',
    });
  });

  it('rolagem no computador: espaço para o cartão abaixo do alvo; sem caber, a janela inteira', () => {
    expect(scrollArea(view, card, false, 40)).toEqual({ top: 76, bottom: 800 - 16 - 220 - 14 });
    expect(scrollArea(view, card, false, 600)).toEqual({ top: 76, bottom: 788 });
  });

  it('rolagem: zero quando visível, centraliza quando cabe, alinha o topo quando não cabe', () => {
    const area = { top: 64, bottom: 500 };
    expect(scrollDelta({ top: 100, left: 0, width: 10, height: 40 }, area)).toBe(0);
    expect(scrollDelta({ top: 900, left: 0, width: 10, height: 36 }, area)).toBe(
      900 - 64 - (436 - 36) / 2,
    );
    expect(scrollDelta({ top: 900, left: 0, width: 10, height: 1000 }, area)).toBe(900 - 64);
  });
});

describe('posição do cartão no celular', () => {
  // iPhone em pé: 402 x 681, cabeçalho até 76, indicador de início de 34px.
  const insets = { top: 0, right: 0, bottom: 34, left: 0 };
  const phone = { width: 402, height: 681, headerBottom: 76, insets };
  const card = { width: 370, height: 220 };

  it('balão logo abaixo de um alvo pequeno, com a largura da tela menos as margens', () => {
    const tabs = { top: 100, left: 16, width: 370, height: 50 };
    const placed = placeCard(tabs, card, phone, true);
    expect(placed).toMatchObject({ kind: 'anchored', side: 'below', left: 16, width: 370 });
    if (placed.kind !== 'anchored') throw new Error('anchored');
    expect(placed.top).toBeGreaterThanOrEqual(tabs.top + tabs.height);
    expect(placed.top + card.height).toBeLessThanOrEqual(681 - 34 - 8);
  });

  it('alvo preso embaixo (barra do painel, barra de ações): balão ACIMA dele, sem cobri-lo', () => {
    const bar = { top: 616, left: 0, width: 402, height: 65 };
    const placed = placeCard(bar, card, phone, true);
    expect(placed).toMatchObject({ kind: 'anchored', side: 'above' });
    if (placed.kind !== 'anchored') throw new Error('anchored');
    expect(placed.top + card.height).toBeLessThanOrEqual(bar.top);
    expect(placed.top).toBeGreaterThanOrEqual(76 + 8);
  });

  it('o "?" no cabeçalho: balão logo abaixo dele', () => {
    const help = { top: 16, left: 300, width: 44, height: 44 };
    expect(placeCard(help, card, phone, true)).toMatchObject({ kind: 'anchored', side: 'below' });
  });

  it('as áreas seguras do celular deitado afastam o balão do entalhe', () => {
    const landscape = {
      width: 844,
      height: 390,
      headerBottom: 70,
      insets: { top: 0, right: 47, bottom: 21, left: 47 },
    };
    const placed = placeCard(
      { top: 90, left: 60, width: 200, height: 44 },
      { width: 750, height: 150 },
      landscape,
      true,
    );
    expect(placed).toMatchObject({ kind: 'anchored', left: 47, width: 844 - 47 - 47 });
  });

  it('alvo alto (lista inteira): folha embaixo, para o começo da lista ficar à vista', () => {
    const list = { top: 88, left: 16, width: 370, height: 3000 };
    expect(placeCard(list, card, phone, true)).toEqual({ kind: 'sheet', side: 'bottom' });
  });

  it('alvo grande na metade de baixo: folha EM CIMA', () => {
    const lower = { top: 300, left: 16, width: 370, height: 381 };
    expect(placeCard(lower, card, phone, true)).toEqual({ kind: 'sheet', side: 'top' });
  });

  it('a trava mantém a folha até o fim do passo (sem alternar com o balão)', () => {
    const tabs = { top: 100, left: 16, width: 370, height: 50 };
    expect(placeCard(tabs, card, phone, true, 'sheet')).toEqual({ kind: 'sheet', side: 'bottom' });
  });

  it('rolagem no celular: espaço para o balão abaixo de um alvo pequeno', () => {
    const withBar = { ...phone, bottomBar: 65 };
    expect(scrollArea(withBar, card, true, 50)).toEqual({
      top: 88,
      bottom: 681 - 42 - 220 - 48 - 14,
    });
  });

  it('rolagem no celular deitado: alvo médio vai para baixo da folha de cima (ela cobre o cabeçalho)', () => {
    const landscape = {
      width: 844,
      height: 390,
      headerBottom: 76,
      insets: { top: 0, right: 47, bottom: 21, left: 47 },
      bottomBar: 0,
    };
    const short = { width: 750, height: 150 };
    // 138px de alvo: nem com o balão (88..149) nem com a folha embaixo (88..207) ele cabe; com a folha em cima, sim.
    expect(scrollArea(landscape, short, true, 138)).toEqual({ top: 162, bottom: 378 });
    // Alto demais para qualquer arranjo: o começo dele logo abaixo do cabeçalho.
    expect(scrollArea(landscape, short, true, 600)).toEqual({ top: 88, bottom: 378 });
  });

  it('a barra de baixo do painel limita a área (o que fica sob ela não aparece)', () => {
    const tall = { width: 370, height: 600 };
    expect(scrollArea({ ...phone, bottomBar: 65 }, tall, true, 2000)).toEqual({
      top: 88,
      bottom: 681 - 65,
    });
  });

  it('o destaque é recortado à janela e some quando o alvo está fora dela', () => {
    expect(
      clipToView({ top: -500, left: 10, width: 380, height: 9000 }, { width: 402, height: 681 }, 6),
    ).toEqual({
      top: -2,
      left: 4,
      width: 392,
      height: 685,
    });
    expect(
      clipToView({ top: 900, left: 0, width: 10, height: 10 }, { width: 402, height: 681 }, 6),
    ).toBeNull();
  });
});
