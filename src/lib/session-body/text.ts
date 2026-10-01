import type { BodyDoc } from './types';

export const WORDS_PER_MINUTE = 200;
export const EXCERPT_MAX = 180;

/** Texto de cada bloco de leitura, na ordem. Títulos de divisor ficam de fora. */
function blockTexts(doc: BodyDoc): { type: string; text: string }[] {
  const out: { type: string; text: string }[] = [];

  const inlineText = (content: unknown): string => {
    if (!Array.isArray(content)) return '';
    return content
      .map((n: { type: string; text?: string }) =>
        n.type === 'hardBreak' ? ' ' : n.type === 'text' ? (n.text ?? '') : '',
      )
      .join('');
  };

  const walk = (node: { type: string; content?: unknown[] }, topType: string) => {
    if (node.type === 'paragraph' || node.type === 'heading') {
      out.push({ type: topType, text: inlineText(node.content) });
      return;
    }
    if (node.type === 'chapterDivider') return;
    if (Array.isArray(node.content)) {
      for (const child of node.content)
        walk(child as { type: string; content?: unknown[] }, topType);
    }
  };

  for (const block of doc.content ?? []) walk(block, block.type);
  return out;
}

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

export function countWords(doc: BodyDoc): number {
  return blockTexts(doc)
    .map((b) => normalize(b.text))
    .filter(Boolean)
    .reduce((sum, text) => sum + text.split(' ').length, 0);
}

export function isBodyEmpty(doc: BodyDoc): boolean {
  return countWords(doc) === 0;
}

/** Palavras / 200, arredondado para cima, no mínimo 1. */
export function readMinutes(doc: BodyDoc): number {
  return Math.max(1, Math.ceil(countWords(doc) / WORDS_PER_MINUTE));
}

/** Corta em `max` caracteres (contando as reticências) sem partir uma palavra. */
export function truncateAtWord(text: string, max = EXCERPT_MAX): string {
  if (text.length <= max) return text;
  const room = max - 1;
  const slice = text.slice(0, room + 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : text.slice(0, room);
  return `${cut.replace(/[\s,;:.\-–—!?]+$/u, '')}…`;
}

/** Resumo automático: o primeiro parágrafo com texto (cai para qualquer bloco de texto). */
export function autoExcerpt(doc: BodyDoc): string {
  const blocks = blockTexts(doc)
    .map((b) => ({ type: b.type, text: normalize(b.text) }))
    .filter((b) => b.text);
  const first = blocks.find((b) => b.type === 'paragraph') ?? blocks[0];
  return first ? truncateAtWord(first.text) : '';
}
