import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  autoExcerpt,
  BODY_MAX_BYTES,
  BODY_MAX_DEPTH,
  canonicalizeBody,
  checkDividers,
  countWords,
  defaultRange,
  isBodyEmpty,
  isSafeHref,
  nextDividerChapter,
  parseBody,
  readMinutes,
  SessionBody,
  suggestTitle,
  truncateAtWord,
  type BodyDoc,
} from './index';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const divider = (chapter: number, title?: string) => ({
  type: 'chapterDivider',
  attrs: title === undefined ? { chapter } : { chapter, title },
});
const doc = (...content: unknown[]) => ({ type: 'doc', content }) as BodyDoc;

describe('parseBody: o que passa', () => {
  it('aceita todos os nós e marcas da lista', () => {
    const body = doc(
      p('abertura'),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Título' }] },
      divider(1, 'Primeiro'),
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'oi ', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'hardBreak' },
          {
            type: 'text',
            text: 'site',
            marks: [{ type: 'link', attrs: { href: 'https://a.com' } }],
          },
        ],
      },
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
    );
    expect(parseBody(body)).toEqual({ ok: true, doc: body });
  });

  it('aceita o documento vazio, com ou sem content', () => {
    expect(parseBody({ type: 'doc' }).ok).toBe(true);
    expect(parseBody({ type: 'doc', content: [] }).ok).toBe(true);
  });

  it('aceita os 4 corpos do seed', () => {
    const seed = readFileSync(join(process.cwd(), 'supabase/seed.sql'), 'utf8');
    const bodies = [...seed.matchAll(/'(\{"type": "doc".*?\})'::jsonb/g)].map((m) => m[1]!);
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    for (const raw of bodies) expect(parseBody(JSON.parse(raw.replace(/''/g, "'"))).ok).toBe(true);
  });
});

describe('parseBody: o que é recusado', () => {
  it.each([
    ['nó desconhecido', doc({ type: 'image', attrs: { src: 'x' } })],
    ['nó de código', doc({ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] })],
    ['título nível 3', doc({ type: 'heading', attrs: { level: 3 }, content: [] })],
    ['atributo desconhecido', doc({ type: 'paragraph', attrs: { style: 'x' } })],
    ['atributo extra no divisor', doc({ type: 'chapterDivider', attrs: { chapter: 1, id: 'x' } })],
    ['chave extra no nó', doc({ type: 'paragraph', foo: 1 })],
    ['divisor sem capítulo', doc({ type: 'chapterDivider', attrs: {} })],
    ['capítulo zero', doc(divider(0))],
    ['capítulo decimal', doc(divider(1.5))],
    ['divisor dentro de citação', doc({ type: 'blockquote', content: [divider(1)] })],
    ['texto vazio', doc({ type: 'paragraph', content: [{ type: 'text', text: '' }] })],
    [
      'item de lista sem parágrafo',
      doc({
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'bulletList', content: [] }] }],
      }),
    ],
  ])('recusa %s', (_label, body) => {
    expect(parseBody(body)).toEqual({ ok: false, issue: 'invalid' });
  });

  it.each([
    ['marca desconhecida', [{ type: 'underline' }]],
    ['marca de código', [{ type: 'code' }]],
    ['marca repetida', [{ type: 'bold' }, { type: 'bold' }]],
    ['atributo em negrito', [{ type: 'bold', attrs: { x: 1 } }]],
    [
      'link com atributo desconhecido',
      [{ type: 'link', attrs: { href: 'https://a.com', style: 'x' } }],
    ],
  ])('recusa %s', (_label, marks) => {
    const body = doc({ type: 'paragraph', content: [{ type: 'text', text: 'a', marks }] });
    expect(parseBody(body).ok).toBe(false);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://a.com',
    '//a.com',
    '/relativo',
    '',
    'https://a .com',
    ' https://a.com',
    'vbscript:x',
    'JaVaScRiPt:alert(1)',
  ])('recusa o link %j', (href) => {
    const body = doc({
      type: 'paragraph',
      content: [{ type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href } }] }],
    });
    expect(parseBody(body).ok).toBe(false);
  });

  it.each(['http://a.com', 'https://a.com/x?y=1#z', 'mailto:oi@a.com'])(
    'aceita o link %s',
    (href) => {
      expect(isSafeHref(href)).toBe(true);
    },
  );

  it.each([null, undefined, 'texto', 42, [], true])('recusa %j como corpo', (value) => {
    expect(parseBody(value)).toEqual({ ok: false, issue: 'invalid' });
  });

  it('recusa um doc com type errado', () => {
    expect(parseBody({ type: 'paragraph' }).ok).toBe(false);
  });

  it('recusa corpo acima de 200 KB (em bytes, não em caracteres)', () => {
    const big = doc(p('a'.repeat(BODY_MAX_BYTES)));
    expect(parseBody(big)).toEqual({ ok: false, issue: 'too_large' });
    // 'ã' tem 2 bytes: 110 mil caracteres passam de 200 KB.
    expect(parseBody(doc(p('ã'.repeat(110_000))))).toEqual({ ok: false, issue: 'too_large' });
    expect(parseBody(doc(p('a'.repeat(150_000)))).ok).toBe(true);
  });

  it('recusa corpo fundo demais, sem estourar a pilha', () => {
    let node: unknown = p('fim');
    for (let i = 0; i < BODY_MAX_DEPTH + 2; i++) {
      node = { type: 'bulletList', content: [{ type: 'listItem', content: [p('x'), node] }] };
    }
    expect(parseBody(doc(node))).toEqual({ ok: false, issue: 'too_deep' });

    let abyss: unknown = { type: 'paragraph' };
    for (let i = 0; i < 2_000; i++) abyss = { type: 'blockquote', content: [abyss] };
    expect(parseBody({ type: 'doc', content: [abyss] })).toEqual({ ok: false, issue: 'too_deep' });
  });

  it('o limite de profundidade deixa passar listas aninhadas razoáveis', () => {
    let node: unknown = p('fim');
    for (let i = 0; i < 3; i++) {
      node = { type: 'bulletList', content: [{ type: 'listItem', content: [p('x'), node] }] };
    }
    expect(parseBody(doc(node)).ok).toBe(true);
  });
});

describe('canonicalizeBody', () => {
  it('deixa o link só com href e tira título vazio do divisor', () => {
    const raw = doc(
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'a',
            marks: [
              {
                type: 'link',
                attrs: {
                  href: 'https://a.com',
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  class: null,
                },
              },
            ],
          },
        ],
      },
      divider(2, '   '),
      divider(3, ' Título '),
      {
        type: 'orderedList',
        attrs: { start: 1 },
        content: [{ type: 'listItem', content: [p('a')] }],
      },
    );
    const parsed = parseBody(raw);
    expect(parsed.ok && parsed.doc.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'https://a.com' } }] },
        ],
      },
      divider(2),
      divider(3, 'Título'),
      { type: 'orderedList', content: [{ type: 'listItem', content: [p('a')] }] },
    ]);
  });

  it('devolve só objetos comuns: attrs sem protótipo (ProseMirror) não chegam à Server Action', () => {
    const nullProto = (value: object) => Object.assign(Object.create(null), value);
    const raw = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: nullProto({ level: 2 }), content: [{ type: 'text', text: 'T' }] },
        { type: 'chapterDivider', attrs: nullProto({ chapter: 1, title: null }) },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'a',
              marks: [
                nullProto({ type: 'bold' }),
                { type: 'link', attrs: nullProto({ href: 'https://a.com' }) },
              ],
            },
          ],
        },
        {
          type: 'orderedList',
          attrs: nullProto({ start: 3 }),
          content: [{ type: 'listItem', content: [p('x')] }],
        },
      ],
    } as unknown as BodyDoc;
    const out = canonicalizeBody(raw);
    const visit = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (typeof value === 'object' && value !== null) {
        expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
        Object.values(value).forEach(visit);
      }
    };
    visit(out);
    expect(out.content?.[0]).toEqual({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'T' }],
    });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    expect(parseBody(out).ok).toBe(true);
  });

  it('é idempotente', () => {
    const once = canonicalizeBody(doc(divider(2, ' x ')));
    expect(canonicalizeBody(once)).toEqual(once);
  });
});

describe('checkDividers', () => {
  it('tudo certo: sem problema nenhum', () => {
    const r = checkDividers(doc(p('a'), divider(10), p('b'), divider(11), divider(12)), 10, 12);
    expect(r).toEqual({ blocking: [], warnings: [] });
  });

  it('divisor fora de ordem bloqueia', () => {
    const r = checkDividers(doc(divider(11), divider(10), divider(12)), 10, 12);
    expect(r.blocking.map((i) => [i.kind, i.chapter])).toEqual([['order', 10]]);
  });

  it('divisor repetido bloqueia como ordem', () => {
    const r = checkDividers(doc(divider(10), divider(10)), 10, 12);
    expect(r.blocking.map((i) => i.kind)).toEqual(['order']);
  });

  it('divisor fora da faixa bloqueia', () => {
    const r = checkDividers(doc(divider(9), divider(10), divider(13)), 10, 12);
    expect(r.blocking.map((i) => [i.kind, i.chapter])).toEqual([
      ['range', 9],
      ['range', 13],
    ]);
  });

  it('capítulo da faixa sem divisor é só aviso', () => {
    const r = checkDividers(doc(divider(10), divider(12)), 10, 12);
    expect(r.blocking).toEqual([]);
    expect(r.warnings.map((i) => [i.kind, i.chapter])).toEqual([['missing', 11]]);
  });

  it('sem nenhum divisor, todo capítulo da faixa vira aviso', () => {
    const r = checkDividers(doc(p('só abertura')), 4, 6);
    expect(r.blocking).toEqual([]);
    expect(r.warnings).toHaveLength(3);
  });

  it('mensagens em pt-BR com o número do capítulo', () => {
    const r = checkDividers(doc(divider(14)), 10, 12);
    expect(r.blocking[0]!.message).toContain('capítulo 14');
    expect(r.blocking[0]!.message).toContain('capítulos 10 a 12');
  });
});

describe('nextDividerChapter', () => {
  it.each([
    [[], 10, 12, 10],
    [[10], 10, 12, 11],
    [[10, 11], 10, 12, 12],
    [[10, 11, 12], 10, 12, 12],
    [[3], 10, 12, 10],
    [[11, 10], 10, 12, 12],
  ])('%j em %i–%i → %i', (existing, from, to, expected) => {
    expect(nextDividerChapter(existing, from, to)).toBe(expected);
  });
});

describe('texto', () => {
  it('conta palavras sem contar o título do divisor', () => {
    expect(
      countWords(doc(p('um dois  três'), divider(1, 'Muitas palavras no título'), p('quatro'))),
    ).toBe(4);
    expect(countWords(doc())).toBe(0);
  });

  it('conta palavras de citação, lista e teoria, e separa blocos', () => {
    const body = doc(
      { type: 'blockquote', content: [p('a b')] },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [p('c')] },
          { type: 'listItem', content: [p('d')] },
        ],
      },
      { type: 'theory', content: [p('e')] },
      p('f'),
    );
    expect(countWords(body)).toBe(6);
  });

  it('hardBreak separa palavras', () => {
    const body = doc({
      type: 'paragraph',
      content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }],
    });
    expect(countWords(body)).toBe(2);
  });

  it('minutos: palavras/200 para cima, mínimo 1', () => {
    expect(readMinutes(doc())).toBe(1);
    expect(readMinutes(doc(p('uma')))).toBe(1);
    expect(readMinutes(doc(p('a '.repeat(200))))).toBe(1);
    expect(readMinutes(doc(p('a '.repeat(201))))).toBe(2);
    expect(readMinutes(doc(p('a '.repeat(1000))))).toBe(5);
  });

  it('isBodyEmpty ignora parágrafos vazios e divisores', () => {
    expect(isBodyEmpty(doc({ type: 'paragraph' }, divider(1, 'Só título'), p('   ')))).toBe(true);
    expect(isBodyEmpty(doc(p('oi')))).toBe(false);
  });
});

describe('resumo automático', () => {
  it('usa o primeiro parágrafo com texto', () => {
    const body = doc(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Título' }] },
      { type: 'paragraph' },
      p('  Primeiro   parágrafo. '),
      p('Segundo.'),
    );
    expect(autoExcerpt(body)).toBe('Primeiro parágrafo.');
  });

  it('até 180 caracteres, sem cortar palavra, com reticências', () => {
    const text = 'palavra '.repeat(40).trim();
    const out = autoExcerpt(doc(p(text)));
    expect(out.length).toBeLessThanOrEqual(180);
    expect(out.endsWith('…')).toBe(true);
    expect(
      out
        .slice(0, -1)
        .split(' ')
        .every((w) => w === 'palavra'),
    ).toBe(true);
  });

  it('não corta quando cabe e não põe reticências', () => {
    const exact = 'a'.repeat(180);
    expect(truncateAtWord(exact)).toBe(exact);
    expect(truncateAtWord('curto')).toBe('curto');
  });

  it('palavra única maior que o limite é cortada no limite', () => {
    const out = truncateAtWord('x'.repeat(500));
    expect(out).toHaveLength(180);
    expect(out.endsWith('…')).toBe(true);
  });

  it('não deixa pontuação pendurada antes das reticências', () => {
    const out = truncateAtWord(`${'ab '.repeat(59)}fim, e mais coisas`);
    expect(out).not.toMatch(/[,;:]…$/);
  });

  it('cai para a citação quando não há parágrafo e devolve vazio sem texto', () => {
    expect(autoExcerpt(doc({ type: 'blockquote', content: [p('só citação')] }))).toBe('só citação');
    expect(autoExcerpt(doc())).toBe('');
  });
});

describe('sugestões', () => {
  it('título sugerido', () => {
    expect(suggestTitle(5, 13, 15)).toBe('Sessão 5: capítulos 13 a 15');
    expect(suggestTitle(5, 13, 13)).toBe('Sessão 5: capítulo 13');
  });

  it.each([
    [null, 52, { from: 1, to: 3 }],
    [12, 52, { from: 13, to: 15 }],
    [50, 52, { from: 51, to: 52 }],
    [51, 52, { from: 52, to: 52 }],
    [52, 52, null],
    [60, 52, null],
  ])('faixa padrão depois do capítulo %j (total %i)', (last, total, expected) => {
    expect(defaultRange(last, total)).toEqual(expected);
  });
});

describe('SessionBody', () => {
  const render = (body: BodyDoc) => renderToStaticMarkup(createElement(SessionBody, { doc: body }));

  it('agrupa em seções por divisor, com a abertura de fora', () => {
    const html = render(doc(p('abertura'), divider(10, 'Um'), p('a'), divider(11), p('b')));
    expect(html).toMatch(/data-opening=""[^>]*><p><span>abertura<\/span><\/p>/);
    expect(html).toContain('id="ch-10"');
    expect(html).toContain('data-chapter="10"');
    expect(html).toContain('id="ch-11"');
    expect(html).toContain('Capítulo </small>'.slice(0, 0) + 'Capítulo ');
    expect(html.indexOf('data-opening')).toBeLessThan(html.indexOf('id="ch-10"'));
    expect(html.indexOf('id="ch-10"')).toBeLessThan(html.indexOf('id="ch-11"'));
    // O parágrafo "a" fica dentro da seção 10, e "b" dentro da 11.
    const s10 = html.slice(html.indexOf('id="ch-10"'), html.indexOf('id="ch-11"'));
    expect(s10).toContain('>a<');
    expect(s10).not.toContain('>b<');
  });

  it('sem divisor, não há seção', () => {
    expect(render(doc(p('só texto')))).not.toContain('<section');
  });

  it('título do corpo vira h3, marcas e link seguros', () => {
    const html = render(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'T' }] },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://a.com' } }],
            },
          ],
        },
      ),
    );
    expect(html).toContain('<h3>');
    expect(html).toContain('<strong>x</strong>');
    expect(html).toContain('href="https://a.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('escapa texto e não gera link com protocolo perigoso', () => {
    const html = render(
      doc({
        type: 'paragraph',
        content: [
          { type: 'text', text: '<script>alert(1)</script>' },
          {
            type: 'text',
            text: 'mau',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      }),
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a ');
  });

  it('teoria tem só o título "Minha teoria"', () => {
    const html = render(doc({ type: 'theory', content: [p('palpite')] }));
    expect(html).toContain('Minha teoria');
    expect(html).not.toContain('achismo');
    expect(html).toContain('palpite');
  });

  it('listas, citação e start da lista ordenada', () => {
    const html = render(
      doc(
        { type: 'blockquote', content: [p('q')] },
        {
          type: 'orderedList',
          attrs: { start: 4 },
          content: [{ type: 'listItem', content: [p('i')] }],
        },
        { type: 'bulletList', content: [{ type: 'listItem', content: [p('j')] }] },
      ),
    );
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<ol start="4">');
    expect(html).toContain('<ul>');
  });
});
