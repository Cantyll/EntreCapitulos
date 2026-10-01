import { getSchema } from '@tiptap/core';
import { Node as PmNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';

import { parseBody, type BodyDoc } from '@/lib/session-body';

import { sessionExtensions } from './extensions';

/*
 * O editor e o servidor precisam concordar: tudo que passa na validação do servidor tem de caber no
 * esquema do ProseMirror (senão a sessão salva não abre) e tudo que o esquema do editor emite tem
 * de passar na validação (senão o autosave seria recusado).
 */

const schema = getSchema(sessionExtensions);

const p = (text: string, marks?: unknown[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

const full = {
  type: 'doc',
  content: [
    p('Abertura'),
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Título' }] },
    { type: 'chapterDivider', attrs: { chapter: 10, title: 'Um' } },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'a ', marks: [{ type: 'bold' }, { type: 'italic' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://a.com' } }] },
      ],
    },
    { type: 'chapterDivider', attrs: { chapter: 11 } },
    { type: 'blockquote', content: [p('citação')] },
    { type: 'theory', content: [p('palpite')] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p('a')] }] },
    {
      type: 'orderedList',
      attrs: { start: 3 },
      content: [
        {
          type: 'listItem',
          content: [
            p('b'),
            { type: 'bulletList', content: [{ type: 'listItem', content: [p('c')] }] },
          ],
        },
      ],
    },
    { type: 'paragraph' },
  ],
};

describe('editor × servidor', () => {
  it('o esquema do editor tem só os nós e marcas da lista', () => {
    expect(Object.keys(schema.nodes).sort()).toEqual(
      [
        'blockquote',
        'bulletList',
        'chapterDivider',
        'doc',
        'hardBreak',
        'heading',
        'listItem',
        'orderedList',
        'paragraph',
        'text',
        'theory',
      ].sort(),
    );
    expect(Object.keys(schema.marks).sort()).toEqual(['bold', 'italic', 'link']);
  });

  it('um corpo válido no servidor cabe no editor (e a ida e volta continua válida)', () => {
    expect(parseBody(full).ok).toBe(true);
    const node = PmNode.fromJSON(schema, full);
    node.check();
    const emitted = node.toJSON();
    const back = parseBody(emitted);
    expect(back.ok).toBe(true);
    if (back.ok)
      expect(back.doc).toEqual(
        parseBody(full).ok ? (parseBody(full) as { doc: BodyDoc }).doc : null,
      );
  });

  it('o que o editor emite com os atributos padrão passa no servidor', () => {
    // Sem atributos escritos: o ProseMirror preenche os padrões (title: null, start: 1, rel...).
    const minimal = {
      type: 'doc',
      content: [
        { type: 'chapterDivider', attrs: { chapter: 1 } },
        { type: 'orderedList', content: [{ type: 'listItem', content: [p('x')] }] },
        p('l', [{ type: 'link', attrs: { href: 'https://a.com' } }]),
      ],
    };
    const emitted = PmNode.fromJSON(schema, minimal).toJSON();
    expect(emitted.content[0].attrs).toEqual({ chapter: 1, title: null });
    expect(emitted.content[2].content[0].marks[0].attrs).toMatchObject({ href: 'https://a.com' });
    expect(parseBody(emitted).ok).toBe(true);
  });

  it('os 4 corpos do seed cabem no editor', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const seed = readFileSync(join(process.cwd(), 'supabase/seed.sql'), 'utf8');
    const bodies = [...seed.matchAll(/'(\{"type": "doc".*?\})'::jsonb/g)].map((m) => m[1]!);
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    for (const raw of bodies) {
      const json = JSON.parse(raw.replace(/''/g, "'"));
      PmNode.fromJSON(schema, json).check();
      expect(parseBody(PmNode.fromJSON(schema, json).toJSON()).ok).toBe(true);
    }
  });

  it.each([
    ['imagem', { type: 'image', attrs: { src: 'x' } }],
    ['código', { type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }],
    ['régua', { type: 'horizontalRule' }],
  ])('o editor recusa %s', (_label, node) => {
    expect(() => PmNode.fromJSON(schema, { type: 'doc', content: [node] }).check()).toThrow();
  });

  it('item de lista não aceita título nem citação; citação só aceita parágrafo', () => {
    const quoteInItem = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [p('a'), { type: 'blockquote', content: [p('b')] }] },
          ],
        },
      ],
    };
    expect(() => PmNode.fromJSON(schema, quoteInItem).check()).toThrow();
    const listInQuote = {
      type: 'doc',
      content: [{ type: 'blockquote', content: [{ type: 'bulletList', content: [] }] }],
    };
    expect(() => PmNode.fromJSON(schema, listInQuote).check()).toThrow();
  });

  it('divisor dentro de citação ou lista não cabe', () => {
    const inQuote = {
      type: 'doc',
      content: [
        { type: 'blockquote', content: [{ type: 'chapterDivider', attrs: { chapter: 1 } }] },
      ],
    };
    expect(() => PmNode.fromJSON(schema, inQuote).check()).toThrow();
  });
});
