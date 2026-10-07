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
  placeCard,
  previousStep,
  progress,
  runAllowedFor,
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

  it('celular: folha inferior; sem alvo: centralizado', () => {
    expect(placeCard({ top: 100, left: 10, width: 50, height: 40 }, card, view, true)).toEqual({
      kind: 'sheet',
    });
    expect(placeCard(null, card, view, false)).toEqual({ kind: 'center' });
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

  it('rolagem: zero quando visível, centraliza quando cabe, alinha o topo quando não cabe', () => {
    const area = { top: 64, bottom: 500 };
    expect(scrollDelta({ top: 100, left: 0, width: 10, height: 40 }, area)).toBe(0);
    expect(scrollDelta({ top: 900, left: 0, width: 10, height: 36 }, area)).toBe(
      900 - 64 - (436 - 36) / 2,
    );
    expect(scrollDelta({ top: 900, left: 0, width: 10, height: 1000 }, area)).toBe(900 - 64);
  });
});
