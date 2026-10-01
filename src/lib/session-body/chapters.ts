import type { BodyDoc, ChapterDividerNode } from './types';

/*
 * Regras dos divisores de capítulo. Capítulos estritamente crescentes e dentro de
 * [chapter_from, chapter_to]; o que vem antes do primeiro divisor é a abertura da sessão. No
 * rascunho, tudo aqui vira só aviso; ao publicar, `blocking` impede a publicação e `warnings`
 * (capítulo da faixa sem divisor) continua só avisando.
 */

export type DividerIssueKind = 'order' | 'range' | 'missing';

export type DividerIssue = { kind: DividerIssueKind; chapter: number; message: string };

export type DividerCheck = { blocking: DividerIssue[]; warnings: DividerIssue[] };

export function dividersOf(doc: BodyDoc): ChapterDividerNode[] {
  return (doc.content ?? []).filter((n): n is ChapterDividerNode => n.type === 'chapterDivider');
}

function describeRange(from: number, to: number): string {
  return from === to ? `capítulo ${from}` : `capítulos ${from} a ${to}`;
}

export function checkDividers(doc: BodyDoc, from: number, to: number): DividerCheck {
  const blocking: DividerIssue[] = [];
  const warnings: DividerIssue[] = [];
  const dividers = dividersOf(doc);

  let previous = 0;
  for (const { attrs } of dividers) {
    const chapter = attrs.chapter;
    if (chapter <= previous) {
      blocking.push({
        kind: 'order',
        chapter,
        message: `A divisória do capítulo ${chapter} está fora de ordem: os capítulos precisam crescer.`,
      });
    } else previous = chapter;

    if (chapter < from || chapter > to) {
      blocking.push({
        kind: 'range',
        chapter,
        message: `A divisória do capítulo ${chapter} está fora da faixa da sessão (${describeRange(from, to)}).`,
      });
    }
  }

  const present = new Set(dividers.map((d) => d.attrs.chapter));
  for (let chapter = from; chapter <= to; chapter++) {
    if (!present.has(chapter)) {
      warnings.push({
        kind: 'missing',
        chapter,
        message: `O capítulo ${chapter} não tem divisória, então não será escondido pelo filtro de spoiler.`,
      });
    }
  }
  return { blocking, warnings };
}

/** Próximo número para a divisória: depois da maior que já existe, dentro da faixa. */
export function nextDividerChapter(existing: readonly number[], from: number, to: number): number {
  const highest = existing.reduce((max, c) => (c > max ? c : max), 0);
  return Math.min(Math.max(highest + 1, from), to);
}
