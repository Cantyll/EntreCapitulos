import { mergeAttributes, Node, type Extensions } from '@tiptap/core';
import Blockquote from '@tiptap/extension-blockquote';
import { ListItem } from '@tiptap/extension-list';
import StarterKit from '@tiptap/starter-kit';

import { CHAPTER_MAX, isSafeHref } from '@/lib/session-body';

/*
 * Extensões do editor, restritas à lista de permissões de `src/lib/session-body/schema.ts`: o que
 * o editor não deve produzir nem existe no esquema do ProseMirror (colar HTML com imagem, código
 * ou sublinhado simplesmente perde esses trechos). Um teste confere que tudo que o editor pode
 * emitir passa na validação do servidor.
 *
 * O divisor de capítulo é só um nó de leitura: o título dele se edita na seção "Capítulos desta
 * sessão" (campo fora do editor), porque um <input> dentro do ProseMirror dá problema de foco e de
 * teclado no iOS.
 */

export const ChapterDivider = Node.create({
  name: 'chapterDivider',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      chapter: { default: 1 },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-chapter-divider]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { chapter, title } = node.attrs as { chapter: number; title: string | null };
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-chapter-divider': '',
        'data-chapter': String(chapter),
        class: 'ec-divider',
      }),
      ['span', { class: 'ec-divider-number' }, `Capítulo ${chapter}`],
      ['span', { class: 'ec-divider-title' }, title ?? ''],
    ];
  },
});

/** "Minha teoria": caixa com parágrafos. O título fixo é do CSS (editor) e do renderizador. */
export const Theory = Node.create({
  name: 'theory',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  parseHTML() {
    return [{ tag: 'aside[data-theory]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-theory': '', class: 'ec-theory' }), 0];
  },
});

/** Citação só com parágrafos (o esquema do servidor não aceita título ou lista dentro dela). */
const QuoteOfParagraphs = Blockquote.extend({ content: 'paragraph+' });

/** Item de lista: um parágrafo e, depois, só parágrafos ou listas (sem título nem citação). */
const PlainListItem = ListItem.extend({
  content: 'paragraph (paragraph | bulletList | orderedList)*',
});

export const sessionExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [2] },
    blockquote: false,
    listItem: false,
    // Fora da lista de permissões:
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      autolink: false,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      isAllowedUri: (url) => isSafeHref(url),
    },
  }),
  QuoteOfParagraphs,
  PlainListItem,
  ChapterDivider,
  Theory,
];

export const MAX_CHAPTER = CHAPTER_MAX;
