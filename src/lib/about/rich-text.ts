import '@/lib/zod-setup';
import * as z from 'zod';

import {
  bodyDepth,
  canonicalizeBody,
  paragraphNodeSchema,
  type BodyDoc,
  type BulletListNode,
  type ParagraphNode,
} from '@/lib/session-body';

import { ABOUT_LIMITS } from './limits';

/*
 * Texto rico da página Sobre (abertura e seções extras): um SUBCONJUNTO do esquema seguro do relato
 * (`src/lib/session-body/schema.ts`). Só parágrafo, quebra de linha, negrito, itálico, link (http, https ou mailto,
 * validado pelo mesmo `isSafeHref`) e lista com marcadores de um parágrafo por item, sem aninhar. Sem título, citação,
 * "Minha teoria", divisória de capítulo, imagem nem HTML: o que não está aqui é RECUSADO (`z.strictObject`), nunca
 * ignorado em silêncio. O editor (`src/components/sobre/editor`) usa as mesmas regras.
 */

export type RichBlock = ParagraphNode | BulletListNode;
export type RichDoc = { type: 'doc'; content?: RichBlock[] };

export const EMPTY_RICH_DOC: RichDoc = { type: 'doc', content: [] };

const listItem = z.strictObject({
  type: z.literal('listItem'),
  content: z.array(paragraphNodeSchema).length(1),
});
const bulletList = z.strictObject({
  type: z.literal('bulletList'),
  content: z.array(listItem).min(1),
});

export const richDocSchema = z.strictObject({
  type: z.literal('doc'),
  content: z.array(z.union([paragraphNodeSchema, bulletList])).optional(),
});

/** Profundidade do JSON de nós (sem recursão). */
export function richDocDepth(doc: unknown): number {
  return bodyDepth(doc);
}

export function isRichDocDeepEnough(doc: unknown): boolean {
  return richDocDepth(doc) <= ABOUT_LIMITS.richMaxDepth;
}

/** Forma guardada: links só com `href`, `attrs` em objetos comuns (a mesma do relato). */
export function canonicalizeRichDoc(doc: RichDoc): RichDoc {
  return canonicalizeBody(doc as BodyDoc) as RichDoc;
}

/** O texto corrido de cada bloco, na ordem (itens de lista contam como um bloco cada). */
export function richDocBlocks(doc: RichDoc): string[] {
  const inlineText = (content: ParagraphNode['content']): string =>
    (content ?? [])
      .map((node) => (node.type === 'hardBreak' ? ' ' : node.text))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  const out: string[] = [];
  for (const block of doc.content ?? []) {
    if (block.type === 'paragraph') out.push(inlineText(block.content));
    else {
      for (const item of block.content) {
        for (const child of item.content) {
          if (child.type === 'paragraph') out.push(inlineText(child.content));
        }
      }
    }
  }
  return out.filter((text) => text !== '');
}

/** Todo o texto, em uma string (para a descrição da página e para saber se está vazio). */
export function richDocText(doc: RichDoc): string {
  return richDocBlocks(doc).join(' ');
}

export function isRichDocEmpty(doc: RichDoc): boolean {
  return richDocBlocks(doc).length === 0;
}
