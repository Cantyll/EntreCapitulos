import {
  TOUR_CHAPTERS,
  TOUR_STEPS,
  type ChapterId,
  type TourChapter,
  type TourRole,
  type TourStep,
} from '@/content/tour/steps';
import { TOUR_VERSION } from '@/content/tour/version';

/*
 * Tutorial do painel (etapa 8k): lógica PURA (sem DOM, sem React, sem banco), testada em `tour.test.ts`.
 * Uma "execução" (`TourRun`) é a lista de ids de passos que a pessoa vai ver, na ordem, e a posição atual.
 */

export type TourMode = 'full' | 'chapter' | 'screen' | 'news';

export type TourRun = {
  mode: TourMode;
  /** Capítulos cobertos (na ordem). Em "Ajuda desta tela", ao fim se oferece continuar o tour depois deles. */
  chapters: ChapterId[];
  steps: string[];
  index: number;
};

export type TourContext = {
  role: TourRole;
  /** Safari do iPhone/iPad fora do app instalado: só aí aparece o passo de instalação. */
  iosSafariOutsideApp: boolean;
};

export type TourRequest =
  | { mode: 'full' }
  | { mode: 'chapter'; chapter: ChapterId }
  | { mode: 'screen'; pathname: string }
  | { mode: 'news'; seen: number };

const STEP_BY_ID = new Map(TOUR_STEPS.map((step) => [step.id, step]));
const CHAPTER_BY_ID = new Map(TOUR_CHAPTERS.map((chapter) => [chapter.id, chapter]));

export function findStep(id: string): TourStep | undefined {
  return STEP_BY_ID.get(id);
}

export function findChapter(id: ChapterId): TourChapter {
  return CHAPTER_BY_ID.get(id)!;
}

/** Os capítulos que este papel vê, na ordem do tour. A moderação: Comentários e Conta. */
export function chaptersFor(role: TourRole): TourChapter[] {
  return TOUR_CHAPTERS.filter((chapter) => chapter.roles.includes(role));
}

function stepVisible(step: TourStep, context: TourContext): boolean {
  if (!findChapter(step.chapter).roles.includes(context.role)) return false;
  if (step.only === 'ios-safari-outside-app' && !context.iosSafariOutsideApp) return false;
  return true;
}

function stepsOf(chapters: readonly ChapterId[], context: TourContext): TourStep[] {
  return chapters.flatMap((chapter) =>
    TOUR_STEPS.filter((step) => step.chapter === chapter && stepVisible(step, context)),
  );
}

function inSegment(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * "Ajuda desta tela": os capítulos que explicam a página. `null` quando a página não tem capítulo próprio (aí
 * vale o tour completo). `/conta` fica fora do painel: só se chega a ela pelo link "Ver o tutorial desta parte".
 */
export function chaptersForPath(pathname: string): ChapterId[] | null {
  if (pathname === '/painel') return ['navegacao'];
  if (inSegment(pathname, '/painel/livros')) return ['livros'];
  if (pathname === '/painel/sessoes') return ['sessoes'];
  if (pathname === '/painel/sessoes/nova' || /^\/painel\/sessoes\/[^/]+$/.test(pathname)) {
    return ['editor', 'publicar'];
  }
  if (inSegment(pathname, '/painel/comentarios')) return ['comentarios'];
  if (inSegment(pathname, '/painel/membros')) return ['membros'];
  if (inSegment(pathname, '/painel/sobre')) return ['sobre'];
  if (pathname === '/conta') return ['conta'];
  return null;
}

function run(mode: TourMode, chapters: ChapterId[], steps: TourStep[]): TourRun | null {
  if (steps.length === 0) return null;
  return { mode, chapters, steps: steps.map((step) => step.id), index: 0 };
}

/** Monta uma execução para o pedido e o papel. `null` = nada a mostrar. */
export function buildRun(request: TourRequest, context: TourContext): TourRun | null {
  const allowed = chaptersFor(context.role).map((chapter) => chapter.id);
  switch (request.mode) {
    case 'full':
      return run('full', allowed, stepsOf(allowed, context));
    case 'chapter': {
      if (!allowed.includes(request.chapter)) return null;
      return run('chapter', [request.chapter], stepsOf([request.chapter], context));
    }
    case 'screen': {
      const chapters = (chaptersForPath(request.pathname) ?? []).filter((id) =>
        allowed.includes(id),
      );
      if (chapters.length === 0) return buildRun({ mode: 'full' }, context);
      return run('screen', chapters, stepsOf(chapters, context));
    }
    case 'news': {
      const steps = stepsOf(allowed, context).filter((step) => step.since > request.seen);
      const chapters = allowed.filter((id) => steps.some((step) => step.chapter === id));
      return run('news', chapters, steps);
    }
  }
}

export function currentStep(tour: TourRun): TourStep {
  return findStep(tour.steps[tour.index]!)!;
}

export function isLastStep(tour: TourRun): boolean {
  return tour.index >= tour.steps.length - 1;
}

/** Próximo passo; `null` quando acabou. */
export function nextStep(tour: TourRun): TourRun | null {
  if (isLastStep(tour)) return null;
  return { ...tour, index: tour.index + 1 };
}

export function previousStep(tour: TourRun): TourRun {
  return { ...tour, index: Math.max(0, tour.index - 1) };
}

export function progress(tour: TourRun): { position: number; total: number; chapter: TourChapter } {
  return {
    position: tour.index + 1,
    total: tour.steps.length,
    chapter: findChapter(currentStep(tour).chapter),
  };
}

/**
 * Depois de "Ajuda desta tela": o resto do tour completo, a partir do capítulo seguinte ao último coberto.
 * `null` quando não há mais nada (o último capítulo do papel já foi visto).
 */
export function continueTour(tour: TourRun, context: TourContext): TourRun | null {
  const allowed = chaptersFor(context.role).map((chapter) => chapter.id);
  const last = tour.chapters.at(-1);
  const from = last ? allowed.indexOf(last) + 1 : 0;
  const rest = allowed.slice(Math.max(from, 0));
  return run('full', rest, stepsOf(rest, context));
}

/** O cartão "Quer um tour rápido?" só aparece para quem nunca viu (0). Leitura que falhou (`null`): nunca. */
export function shouldOfferTour(seen: number | null): boolean {
  return seen === 0;
}

/** Há passos novos para quem já viu uma versão anterior. Leitura que falhou (`null`): não. */
export function hasNews(seen: number | null, version: number = TOUR_VERSION): boolean {
  return seen !== null && seen > 0 && seen < version;
}

/** Uma execução guardada ainda serve? (passos conhecidos, posição válida, modo conhecido). */
export function isValidRun(value: unknown): value is TourRun {
  if (typeof value !== 'object' || value === null) return false;
  const tour = value as Record<string, unknown>;
  const keys = Object.keys(tour).sort().join(',');
  if (keys !== 'chapters,index,mode,steps') return false;
  if (!['full', 'chapter', 'screen', 'news'].includes(tour.mode as string)) return false;
  if (
    !Array.isArray(tour.steps) ||
    tour.steps.length === 0 ||
    tour.steps.length > TOUR_STEPS.length
  ) {
    return false;
  }
  if (!tour.steps.every((id) => typeof id === 'string' && STEP_BY_ID.has(id))) return false;
  if (
    !Array.isArray(tour.chapters) ||
    !tour.chapters.every((id) => CHAPTER_BY_ID.has(id as ChapterId))
  ) {
    return false;
  }
  return (
    typeof tour.index === 'number' &&
    Number.isInteger(tour.index) &&
    tour.index >= 0 &&
    tour.index < tour.steps.length
  );
}

/** Uma execução guardada só vale para o papel de agora (a pessoa pode ter sido rebaixada no meio). */
export function runAllowedFor(tour: TourRun, context: TourContext): boolean {
  return tour.steps.every((id) => {
    const step = findStep(id);
    return step !== undefined && stepVisible(step, context);
  });
}
