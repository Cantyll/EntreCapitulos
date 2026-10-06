import { getSchema } from '@tiptap/core';
import { Node as PmNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';

import { defaultAbout, parseAbout, type RichDoc } from '@/lib/about';
import { richDocSchema } from '@/lib/about';

import { aboutExtensions } from './extensions';

/*
 * O editor e o servidor concordam: tudo que passa na validação do texto rico cabe no esquema do ProseMirror (senão o
 * texto salvo não abre) e tudo que o editor pode emitir passa na validação (senão salvar seria recusado).
 */

const schema = getSchema(aboutExtensions);

const p = (text: string, marks?: unknown[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

const full = {
  type: 'doc',
  content: [
    p('Abertura'),
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'negrito ', marks: [{ type: 'bold' }, { type: 'italic' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://a.com' } }] },
      ],
    },
    p('mail', [{ type: 'link', attrs: { href: 'mailto:a@b.com' } }]),
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p('um')] },
        { type: 'listItem', content: [p('dois')] },
      ],
    },
    { type: 'paragraph' },
  ],
};

const asAbout = (intro: unknown) => ({ ...defaultAbout(), intro });

describe('editor da página Sobre × servidor', () => {
  it('o esquema do editor tem só os nós e marcas do subconjunto', () => {
    expect(Object.keys(schema.nodes).sort()).toEqual(
      ['bulletList', 'doc', 'hardBreak', 'listItem', 'paragraph', 'text'].sort(),
    );
    expect(Object.keys(schema.marks).sort()).toEqual(['bold', 'italic', 'link']);
  });

  it('um texto válido no servidor cabe no editor, e o que o editor emite continua válido', () => {
    expect(richDocSchema.safeParse(full).success).toBe(true);
    const node = PmNode.fromJSON(schema, full);
    node.check();
    const emitted = node.toJSON();
    expect(parseAbout(asAbout(emitted)).ok).toBe(true);
  });

  it('o que o editor emite com os atributos padrão (link com rel e target) passa depois de canonicalizar', () => {
    const emitted = PmNode.fromJSON(schema, {
      type: 'doc',
      content: [p('l', [{ type: 'link', attrs: { href: 'https://a.com' } }])],
    }).toJSON();
    expect(emitted.content[0].content[0].marks[0].attrs).toMatchObject({ href: 'https://a.com' });
    const parsed = parseAbout(asAbout(emitted));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(JSON.stringify(parsed.content.intro)).toContain('"attrs":{"href":"https://a.com"}');
    }
  });

  it('o texto padrão da página (src/content/sobre.ts) cabe no editor', () => {
    const intro = defaultAbout().intro as RichDoc;
    PmNode.fromJSON(schema, intro).check();
  });

  it.each([
    ['título', { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'x' }] }],
    ['citação', { type: 'blockquote', content: [p('x')] }],
    ['"Minha teoria"', { type: 'theory', content: [p('x')] }],
    ['divisória', { type: 'chapterDivider', attrs: { chapter: 1 } }],
    ['imagem', { type: 'image', attrs: { src: 'x' } }],
    ['bloco de código', { type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }],
    ['régua', { type: 'horizontalRule' }],
    ['lista numerada', { type: 'orderedList', content: [{ type: 'listItem', content: [p('x')] }] }],
  ])('o editor recusa %s', (_label, node) => {
    expect(() => PmNode.fromJSON(schema, { type: 'doc', content: [node] }).check()).toThrow();
  });

  it('item de lista só aceita UM parágrafo (sem lista aninhada nem segundo parágrafo)', () => {
    const nested = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                p('a'),
                { type: 'bulletList', content: [{ type: 'listItem', content: [p('b')] }] },
              ],
            },
          ],
        },
      ],
    };
    expect(() => PmNode.fromJSON(schema, nested).check()).toThrow();
    const twoParagraphs = {
      type: 'doc',
      content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [p('a'), p('b')] }] }],
    };
    expect(() => PmNode.fromJSON(schema, twoParagraphs).check()).toThrow();
  });

  it('as marcas recusadas pelo servidor (sublinhado, tachado, código) não existem no editor', () => {
    for (const type of ['underline', 'strike', 'code']) {
      expect(() =>
        PmNode.fromJSON(schema, { type: 'doc', content: [p('x', [{ type }])] }).check(),
      ).toThrow();
    }
  });
});
