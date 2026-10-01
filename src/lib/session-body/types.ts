/*
 * Tipos do corpo de uma sessão (JSON do Tiptap/ProseMirror). Só existe o que está na lista de
 * permissões de `schema.ts`: qualquer outra coisa é recusada ao salvar e ao ler.
 */

export type LinkMark = { type: 'link'; attrs: { href: string } };
export type TextMark = { type: 'bold' } | { type: 'italic' } | LinkMark;

export type TextNode = { type: 'text'; text: string; marks?: TextMark[] };
export type HardBreakNode = { type: 'hardBreak' };
export type InlineNode = TextNode | HardBreakNode;

export type ParagraphNode = { type: 'paragraph'; content?: InlineNode[] };
export type HeadingNode = { type: 'heading'; attrs: { level: 2 }; content?: InlineNode[] };
export type BlockquoteNode = { type: 'blockquote'; content: ParagraphNode[] };
/** "Minha teoria": caixa com o palpite da leitora. O título fixo vem do renderizador. */
export type TheoryNode = { type: 'theory'; content: ParagraphNode[] };
export type ListItemNode = {
  type: 'listItem';
  content: [ParagraphNode, ...(ParagraphNode | BulletListNode | OrderedListNode)[]];
};
export type BulletListNode = { type: 'bulletList'; content: ListItemNode[] };
export type OrderedListNode = {
  type: 'orderedList';
  attrs?: { start?: number };
  content: ListItemNode[];
};
export type ChapterDividerNode = {
  type: 'chapterDivider';
  attrs: { chapter: number; title?: string | null };
};

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BlockquoteNode
  | TheoryNode
  | BulletListNode
  | OrderedListNode
  | ChapterDividerNode;

export type BodyDoc = { type: 'doc'; content?: BlockNode[] };

export const EMPTY_BODY: BodyDoc = { type: 'doc', content: [] };
