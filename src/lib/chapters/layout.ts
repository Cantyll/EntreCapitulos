/*
 * Como a fita compacta cabe na largura. Cada capítulo precisa de pelo menos 3px; se
 * `total × 3px` mais os vãos não couber, a fita é desenhada por SESSÃO: um bloco por sessão, com
 * largura proporcional aos capítulos, e uma única trilha contínua para os capítulos por ler.
 *
 * Sem DOM e sem medir nada: o servidor não sabe a largura do contêiner, então devolve o menor degrau
 * da escada (`STRIP_WIDTH_STEPS`) que comporta a fita por capítulo, e o CSS escolhe o desenho com
 * `@container (min-width: …)`.
 */

import type { ChapterStrip, StripSegmentKind, StripSession } from './strip';

/** Largura mínima de um segmento, em px. */
export const MIN_SEGMENT_PX = 3;

/** Largura mínima do contêiner para desenhar um segmento por capítulo. */
export function requiredStripWidth(total: number, gapPx: number): number {
  if (total < 1) return 0;
  return total * MIN_SEGMENT_PX + (total - 1) * gapPx;
}

/** Degraus de largura (px) em que o CSS troca de desenho. Precisa bater com `ChapterStrip.module.css`. */
export const STRIP_WIDTH_STEPS = [
  160, 200, 240, 280, 320, 360, 400, 480, 560, 640, 760, 900, 1040, 1200,
] as const;

/**
 * Índice do menor degrau que comporta um segmento por capítulo, ou `null` quando nem o maior comporta
 * (a fita por capítulo nem é desenhada: só a por sessão).
 */
export function chapterModeStep(total: number, gapPx: number): number | null {
  const need = requiredStripWidth(total, gapPx);
  const index = STRIP_WIDTH_STEPS.findIndex((width) => width >= need);
  return index === -1 ? null : index;
}

/** Um bloco da fita por sessão. */
export type StripBlock = {
  kind: StripSegmentKind;
  from: number;
  to: number;
  /** Quantidade de capítulos: a largura do bloco é proporcional a ela. */
  span: number;
  session?: StripSession;
  tone: 0 | 1;
  /** Nome acessível, só nos blocos que são links. */
  ariaLabel: string | null;
};

export function blockAriaLabel(session: StripSession, from: number, to: number): string {
  return from === to
    ? `Sessão ${session.number}, capítulo ${from}`
    : `Sessão ${session.number}, capítulos ${from} a ${to}`;
}

/**
 * Junta os segmentos em blocos: um por sessão, um por trecho lido sem sessão, um para a próxima
 * sessão e UM só para tudo que falta ler.
 */
export function buildStripBlocks(strip: ChapterStrip): StripBlock[] {
  const blocks: StripBlock[] = [];
  for (const segment of strip.segments) {
    const previous = blocks.at(-1);
    const sameSession =
      previous?.session !== undefined &&
      segment.session !== undefined &&
      previous.session.number === segment.session.number;
    const sameRun = previous !== undefined && !segment.session && previous.kind === segment.kind;

    if (previous && (sameSession || sameRun)) {
      previous.to = segment.chapter;
      previous.span += 1;
      continue;
    }
    blocks.push({
      kind: segment.kind,
      from: segment.chapter,
      to: segment.chapter,
      span: 1,
      session: segment.session,
      tone: segment.tone,
      ariaLabel: null,
    });
  }

  for (const block of blocks) {
    if (block.session) block.ariaLabel = blockAriaLabel(block.session, block.from, block.to);
  }
  return blocks;
}
