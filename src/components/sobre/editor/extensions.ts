import type { Extensions } from '@tiptap/core';
import { ListItem } from '@tiptap/extension-list';
import StarterKit from '@tiptap/starter-kit';

import { isSafeHref } from '@/lib/session-body';

/*
 * Extensões do editor de texto rico da página Sobre: o SUBCONJUNTO da lista de permissões de `src/lib/about/rich-text.ts`.
 * Só parágrafo, quebra de linha, negrito, itálico, link (http, https ou mailto) e lista com marcadores de um parágrafo
 * por item. O que não está aqui não existe no esquema do ProseMirror: colar HTML com título, citação, imagem, código
 * ou lista numerada simplesmente perde esses trechos. `extensions.test.ts` confere que o editor e o servidor concordam.
 */

/** Item de lista: um parágrafo só (a página Sobre não aninha listas). */
const PlainListItem = ListItem.extend({ content: 'paragraph' });

export const aboutExtensions: Extensions = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    orderedList: false,
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
  PlainListItem,
];
