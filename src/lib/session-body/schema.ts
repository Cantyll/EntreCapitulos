import '@/lib/zod-setup';
import { z } from 'zod';

import type { BodyDoc } from './types';

/*
 * Lista de permissões do corpo da sessão. Valida ao salvar e ao ler: um nó, uma marca ou um
 * atributo que não esteja aqui é recusado (`z.strictObject`), nunca ignorado em silêncio. Sem
 * imagens nesta etapa. O editor (`src/components/sessoes/editor`) usa as mesmas regras, e um
 * teste confere que o esquema do ProseMirror aceita tudo que passa por aqui.
 */

export const BODY_MAX_BYTES = 200 * 1024;
/** `doc` conta como nível 1. Uma lista dentro de lista dentro de citação cabe com folga. */
export const BODY_MAX_DEPTH = 12;
export const CHAPTER_MAX = 1000;
export const DIVIDER_TITLE_MAX = 200;
const HREF_MAX = 2048;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** `href` só http, https ou mailto, e uma URL de verdade. */
export function isSafeHref(href: string): boolean {
  if (href.length === 0 || href.length > HREF_MAX) return false;
  if (/[\u0000-\u001f\u007f\s]/.test(href)) return false;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

const boldMark = z.strictObject({ type: z.literal('bold') });
const italicMark = z.strictObject({ type: z.literal('italic') });
const linkMark = z.strictObject({
  type: z.literal('link'),
  attrs: z.strictObject({
    href: z.string().refine(isSafeHref, 'Link inválido: só http, https ou mailto.'),
    // O Link do Tiptap também devolve estes: aceitos, e `canonicalizeBody` os descarta.
    target: z.literal('_blank').nullish(),
    rel: z.literal('noopener noreferrer nofollow').or(z.literal('noopener noreferrer')).nullish(),
    class: z.null().optional(),
    title: z.null().optional(),
  }),
});
const mark = z.discriminatedUnion('type', [boldMark, italicMark, linkMark]);

const textNode = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1),
  marks: z
    .array(mark)
    .max(3)
    .refine((marks) => new Set(marks.map((m) => m.type)).size === marks.length, 'Marca repetida.')
    .optional(),
});
const hardBreakNode = z.strictObject({ type: z.literal('hardBreak') });
const inline = z.discriminatedUnion('type', [textNode, hardBreakNode]);

const paragraphNode = z.strictObject({
  type: z.literal('paragraph'),
  content: z.array(inline).optional(),
});
const headingNode = z.strictObject({
  type: z.literal('heading'),
  attrs: z.strictObject({ level: z.literal(2) }),
  content: z.array(inline).optional(),
});
const blockquoteNode = z.strictObject({
  type: z.literal('blockquote'),
  content: z.array(paragraphNode).min(1),
});
const theoryNode = z.strictObject({
  type: z.literal('theory'),
  content: z.array(paragraphNode).min(1),
});
const dividerNode = z.strictObject({
  type: z.literal('chapterDivider'),
  attrs: z.strictObject({
    chapter: z.number().int().min(1).max(CHAPTER_MAX),
    title: z.string().max(DIVIDER_TITLE_MAX).nullish(),
  }),
});

type ListLike = z.ZodType<unknown>;
const listItemNode: ListLike = z.lazy(() =>
  z.strictObject({
    type: z.literal('listItem'),
    content: z
      .array(z.union([paragraphNode, bulletListNode, orderedListNode]))
      .min(1)
      .refine((items) => (items[0] as { type: string }).type === 'paragraph', {
        message: 'O item da lista começa com um parágrafo.',
      }),
  }),
);
const bulletListNode: ListLike = z.lazy(() =>
  z.strictObject({ type: z.literal('bulletList'), content: z.array(listItemNode).min(1) }),
);
const orderedListNode: ListLike = z.lazy(() =>
  z.strictObject({
    type: z.literal('orderedList'),
    attrs: z
      .strictObject({
        start: z.number().int().min(1).max(9999).optional(),
        type: z.null().optional(),
      })
      .optional(),
    content: z.array(listItemNode).min(1),
  }),
);

const blockNode = z.union([
  paragraphNode,
  headingNode,
  blockquoteNode,
  theoryNode,
  bulletListNode,
  orderedListNode,
  dividerNode,
]);

export const bodySchema = z.strictObject({
  type: z.literal('doc'),
  content: z.array(blockNode).optional(),
});

export type BodyIssue = 'too_large' | 'too_deep' | 'invalid';

export type ParsedBody = { ok: true; doc: BodyDoc } | { ok: false; issue: BodyIssue };

export const BODY_ISSUE_MESSAGES: Record<BodyIssue, string> = {
  too_large: 'O texto ficou grande demais (limite de 200 KB). Divida em duas sessões.',
  too_deep: 'O texto tem listas e citações aninhadas demais.',
  invalid: 'O texto tem algo que o editor não aceita. Recarregue a página e tente de novo.',
};

/** Profundidade do JSON de nós, sem recursão (um JSON malicioso poderia estourar a pilha). */
export function bodyDepth(input: unknown): number {
  let max = 0;
  const stack: { value: unknown; depth: number }[] = [{ value: input, depth: 1 }];
  while (stack.length > 0) {
    const { value, depth } = stack.pop()!;
    if (typeof value !== 'object' || value === null) continue;
    if (depth > max) max = depth;
    // Só os caminhos de aninhamento de nós: `content` (e `marks` e `attrs` contam como filhos).
    const node = value as Record<string, unknown>;
    const content = node.content;
    if (Array.isArray(content))
      for (const child of content) stack.push({ value: child, depth: depth + 1 });
    if (max > BODY_MAX_DEPTH * 4) break;
  }
  return max;
}

/** Tamanho do corpo em bytes UTF-8, como o banco e o limite de 200 KB o veem. */
export function bodyBytes(input: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(input)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Valida o corpo vindo do cliente ou do banco. Confere tamanho e profundidade ANTES do zod, para
 * um documento enorme ou fundo demais nunca chegar a percorrer o esquema.
 */
export function parseBody(input: unknown): ParsedBody {
  if (typeof input !== 'object' || input === null) return { ok: false, issue: 'invalid' };
  if (bodyBytes(input) > BODY_MAX_BYTES) return { ok: false, issue: 'too_large' };
  if (bodyDepth(input) > BODY_MAX_DEPTH) return { ok: false, issue: 'too_deep' };
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) return { ok: false, issue: 'invalid' };
  return { ok: true, doc: canonicalizeBody(parsed.data as BodyDoc) };
}

/**
 * Forma guardada no banco: links só com `href` (o `rel` e o `target` são do renderizador) e
 * `title` vazio vira ausente. Idempotente.
 */
export function canonicalizeBody(doc: BodyDoc): BodyDoc {
  const walk = (node: unknown): unknown => {
    if (typeof node !== 'object' || node === null) return node;
    const n = node as Record<string, unknown>;
    const out: Record<string, unknown> = { ...n };
    // O ProseMirror guarda `attrs` em objetos sem protótipo, que o React não envia para uma Server
    // Action (chegam como "function"). Copiar para um objeto comum resolve, e o JSON sai igual.
    if (typeof n.attrs === 'object' && n.attrs !== null) out.attrs = { ...(n.attrs as object) };
    if (Array.isArray(n.marks)) {
      out.marks = n.marks.map((m) => {
        const mk = m as { type: string; attrs?: { href?: string } };
        return mk.type === 'link' ? { type: 'link', attrs: { href: mk.attrs?.href } } : { ...mk };
      });
    }
    if (n.type === 'chapterDivider') {
      const attrs = n.attrs as { chapter: number; title?: string | null };
      const title = attrs.title?.trim();
      out.attrs = title ? { chapter: attrs.chapter, title } : { chapter: attrs.chapter };
    }
    if (n.type === 'orderedList' && n.attrs) {
      const start = (n.attrs as { start?: number }).start;
      if (start && start !== 1) out.attrs = { start };
      else delete out.attrs;
    }
    if (Array.isArray(n.content)) out.content = n.content.map(walk);
    return out;
  };
  return walk(doc) as BodyDoc;
}
