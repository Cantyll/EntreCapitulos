import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultAbout } from './defaults';
import { ABOUT_LIMITS } from './limits';
import { isRichDocEmpty, richDocBlocks, richDocText, type RichDoc } from './rich-text';
import { parseAbout, type AboutContent } from './schema';
import { charCount, normalizeLine, normalizeMultiline } from './text';
import {
  isSafeLinkUrl,
  isSitePhotoPath,
  isSiteUploadPath,
  normalizeLinkUrl,
  sitePhotoUrl,
} from './urls';

const UUID = '0b9f5f00-1111-4222-8333-444455556666';
const PHOTO = `site/sobre/${UUID}.webp`;

const p = (text: string, marks?: unknown[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks });

/** Um conteúdo válido; cada teste muda uma coisa. */
function valid(patch: Partial<Record<keyof AboutContent, unknown>> = {}): Record<string, unknown> {
  return { ...defaultAbout(), ...patch };
}

const ok = (input: unknown, options?: { forPublish?: boolean }) => {
  const result = parseAbout(input, options);
  if (!result.ok) throw new Error(`esperava válido: ${JSON.stringify(result)}`);
  return result.content;
};
const bad = (input: unknown, options?: { forPublish?: boolean }) => {
  const result = parseAbout(input, options);
  if (result.ok) throw new Error('esperava inválido');
  return result;
};
const pathsOf = (input: unknown, options?: { forPublish?: boolean }) =>
  bad(input, options).fields.map((field) => field.path);

describe('conteúdo padrão', () => {
  it('é válido, também para publicar, e vem do texto de src/content/sobre.ts', () => {
    const content = ok(defaultAbout(), { forPublish: true });
    expect(content.title).toBe('Oi, eu sou a Agatha.');
    expect(richDocText(content.intro)).toContain('lápis na mão');
    expect(content.howItWorks.steps).toHaveLength(3);
    expect(content.photo).toBeNull();
    expect(content.sections).toEqual([]);
    expect(content.links).toEqual([]);
  });

  it('cada chamada devolve um objeto novo (o editor pode mudá-lo)', () => {
    const a = defaultAbout();
    a.title = 'mudou';
    expect(defaultAbout().title).toBe('Oi, eu sou a Agatha.');
  });

  it('é idempotente: validar a forma canônica devolve o mesmo conteúdo', () => {
    const once = ok(defaultAbout());
    expect(ok(once)).toEqual(once);
  });
});

describe('limites dos campos (no limite passa, um acima não)', () => {
  const at = (n: number) => 'a'.repeat(n);

  it('título: 1 a 120', () => {
    ok(valid({ title: at(120) }));
    expect(pathsOf(valid({ title: at(121) }))).toEqual(['title']);
    expect(pathsOf(valid({ title: '   ' }))).toEqual(['title']);
  });

  it('bio: até 300 e pode ficar vazia', () => {
    ok(valid({ bio: at(300) }));
    ok(valid({ bio: '' }));
    expect(pathsOf(valid({ bio: at(301) }))).toEqual(['bio']);
  });

  it('seções extras: até 3, título de 1 a 80', () => {
    const section = (title: string) => ({ title, body: doc(p('texto')) });
    ok(valid({ sections: [section('a'), section('b'), section('c')] }));
    expect(pathsOf(valid({ sections: [1, 2, 3, 4].map((n) => section(`s${n}`)) }))).toEqual([
      'sections',
    ]);
    ok(valid({ sections: [section(at(80))] }));
    expect(pathsOf(valid({ sections: [section(at(81))] }))).toEqual(['sections.0.title']);
    expect(pathsOf(valid({ sections: [section('')] }))).toEqual(['sections.0.title']);
  });

  it('links: até 5, rótulo de 1 a 40', () => {
    const link = (n: number) => ({ label: `L${n}`, url: `https://exemplo.com/${n}` });
    ok(valid({ links: [1, 2, 3, 4, 5].map(link) }));
    expect(pathsOf(valid({ links: [1, 2, 3, 4, 5, 6].map(link) }))).toEqual(['links']);
    ok(valid({ links: [{ label: at(40), url: 'https://exemplo.com' }] }));
    expect(pathsOf(valid({ links: [{ label: at(41), url: 'https://exemplo.com' }] }))).toEqual([
      'links.0.label',
    ]);
  });

  it('"Como funciona": de 1 a 6 passos, título até 60 e texto até 400', () => {
    const step = (n: number) => ({ title: `Passo ${n}`, text: 'Texto' });
    const how = (steps: unknown[]) => ({ visible: true, steps });
    ok(valid({ howItWorks: how([1, 2, 3, 4, 5, 6].map(step)) }));
    expect(pathsOf(valid({ howItWorks: how([]) }))).toEqual(['howItWorks.steps']);
    expect(pathsOf(valid({ howItWorks: how([1, 2, 3, 4, 5, 6, 7].map(step)) }))).toEqual([
      'howItWorks.steps',
    ]);
    ok(valid({ howItWorks: how([{ title: at(60), text: at(400) }]) }));
    expect(pathsOf(valid({ howItWorks: how([{ title: at(61), text: 'x' }]) }))).toEqual([
      'howItWorks.steps.0.title',
    ]);
    expect(pathsOf(valid({ howItWorks: how([{ title: 'x', text: at(401) }]) }))).toEqual([
      'howItWorks.steps.0.text',
    ]);
  });

  it('chamada final: texto de 1 a 200', () => {
    ok(valid({ cta: { visible: true, text: at(200) } }));
    expect(pathsOf(valid({ cta: { visible: true, text: at(201) } }))).toEqual(['cta.text']);
    expect(pathsOf(valid({ cta: { visible: false, text: '' } }))).toEqual(['cta.text']);
  });

  it('conta em caracteres (code points), como o banco: 120 emojis cabem no título', () => {
    expect(charCount('😀'.repeat(120))).toBe(120);
    ok(valid({ title: '😀'.repeat(120) }));
    expect(pathsOf(valid({ title: '😀'.repeat(121) }))).toEqual(['title']);
  });

  it('os interruptores são booleanos', () => {
    expect(pathsOf(valid({ stats: { visible: 'sim' } }))).toContain('stats.visible');
    ok(valid({ stats: { visible: false }, cta: { visible: false, text: 'x' } }));
  });
});

describe('texto simples normalizado', () => {
  it('uma linha: quebras viram espaço, invisíveis saem, pontas aparadas', () => {
    expect(normalizeLine('  Oi\n\tmundo​  ')).toBe('Oi mundo');
    expect(normalizeLine(42)).toBe('');
  });

  it('várias linhas: no máximo uma linha em branco, sem invisíveis', () => {
    expect(normalizeMultiline('a\r\n\r\n\r\n\r\nb‮  \nc')).toBe('a\n\nb\nc');
  });

  it('o conteúdo sai normalizado do parseAbout', () => {
    const content = ok(valid({ title: '  Meu\ntítulo​ ', bio: 'linha 1\n\n\n\nlinha 2' }));
    expect(content.title).toBe('Meu título');
    expect(content.bio).toBe('linha 1\n\nlinha 2');
  });
});

describe('links: só https', () => {
  const refused = [
    'http://exemplo.com',
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<b>x</b>',
    'mailto:a@b.com',
    'ftp://exemplo.com',
    '//exemplo.com',
    'exemplo.com',
    '/caminho',
    'https://usuario:senha@exemplo.com',
    'https://usuario@exemplo.com',
    'https://exemplo.com/a b',
    'https://exemplo.com\\@outro.com',
    'https:/exemplo.com',
    'https:exemplo.com',
    'https:///exemplo.com',
    'HTTPS://exemplo.com',
    'https://',
    '',
  ];
  it.each(refused)('recusa %j', (url) => {
    expect(isSafeLinkUrl(url)).toBe(false);
    expect(pathsOf(valid({ links: [{ label: 'L', url }] }))).toEqual(['links.0.url']);
  });

  it('recusa um endereço com mais de 2048 caracteres', () => {
    expect(isSafeLinkUrl(`https://exemplo.com/${'a'.repeat(2048)}`)).toBe(false);
    expect(isSafeLinkUrl(`https://exemplo.com/${'a'.repeat(2000)}`)).toBe(true);
  });

  it.each([
    'https://exemplo.com',
    'https://sub.exemplo.com.br/caminho/x?a=1&b=2#topo',
    'https://exemplo.com:8443/x',
    'https://xn--exemplo-9ya.com',
  ])('aceita %j', (url) => {
    expect(isSafeLinkUrl(url)).toBe(true);
    ok(valid({ links: [{ label: 'L', url }] }));
  });

  it('o que se digita sem esquema ganha https://, e o que tem esquema errado NÃO é "consertado"', () => {
    expect(normalizeLinkUrl('exemplo.com/x')).toBe('https://exemplo.com/x');
    expect(normalizeLinkUrl('  exemplo.com  ')).toBe('https://exemplo.com');
    expect(normalizeLinkUrl('http://exemplo.com')).toBe('http://exemplo.com');
    expect(normalizeLinkUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(normalizeLinkUrl('')).toBe('');
    expect(isSafeLinkUrl(normalizeLinkUrl('http://exemplo.com'))).toBe(false);
  });
});

describe('foto', () => {
  it('aceita só o caminho gerado pelo servidor e exige o texto alternativo', () => {
    ok(valid({ photo: { path: PHOTO, alt: 'Retrato da autora' } }));
    expect(pathsOf(valid({ photo: { path: PHOTO, alt: '   ' } }))).toEqual(['photo.alt']);
    expect(pathsOf(valid({ photo: { path: PHOTO, alt: 'a'.repeat(121) } }))).toEqual(['photo.alt']);
    ok(valid({ photo: { path: PHOTO, alt: 'a'.repeat(120) } }));
  });

  it.each([
    `site/sobre/${UUID}.png`,
    `site/sobre/${UUID}.jpg`,
    `books/${UUID}/${UUID}.webp`,
    'site/sobre/../x.webp',
    `site/sobre/${UUID}.webp/extra`,
    `/site/sobre/${UUID}.webp`,
    'site/sobre/nome-solto.webp',
    `site/sobre/${UUID.toUpperCase()}.webp`,
    '',
  ])('recusa o caminho %j', (path) => {
    expect(isSitePhotoPath(path)).toBe(false);
    expect(pathsOf(valid({ photo: { path, alt: 'x' } }))).toEqual(['photo.path']);
  });

  it('o arquivo ENVIADO pelo navegador tem png, jpg ou webp; o processado só webp', () => {
    expect(isSiteUploadPath(`site/sobre/${UUID}.png`)).toBe(true);
    expect(isSiteUploadPath(`site/sobre/${UUID}.jpg`)).toBe(true);
    expect(isSiteUploadPath(`site/sobre/${UUID}.webp`)).toBe(true);
    expect(isSiteUploadPath(`site/sobre/${UUID}.gif`)).toBe(false);
    expect(isSiteUploadPath(`books/${UUID}/a.png`)).toBe(false);
  });

  describe('URL pública', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('monta a URL do bucket covers a partir da variável do Supabase', () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
      expect(sitePhotoUrl(PHOTO)).toBe(
        `https://abc.supabase.co/storage/v1/object/public/covers/${PHOTO}`,
      );
    });

    it('sem variável, ou com caminho que não é o da foto, não há URL (a página usa as iniciais)', () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
      expect(sitePhotoUrl(PHOTO)).toBeNull();
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
      expect(sitePhotoUrl(`books/${UUID}/${UUID}.webp`)).toBeNull();
      expect(sitePhotoUrl(null)).toBeNull();
    });
  });
});

describe('texto rico: só parágrafo, negrito, itálico, lista e link', () => {
  const link = (href: string) => [{ type: 'link', attrs: { href } }];

  it('aceita parágrafos, quebra de linha, negrito, itálico, links http, https e mailto e lista', () => {
    const intro = doc(
      p('Normal'),
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'negrito ', marks: [{ type: 'bold' }] },
          { type: 'hardBreak' },
          { type: 'text', text: 'itálico', marks: [{ type: 'italic' }] },
        ],
      },
      p('http', link('http://exemplo.com')),
      p('https', link('https://exemplo.com')),
      p('mail', link('mailto:a@b.com')),
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [p('um')] },
          { type: 'listItem', content: [p('dois')] },
        ],
      },
    );
    const content = ok(valid({ intro }));
    expect(richDocBlocks(content.intro as RichDoc)).toEqual([
      'Normal',
      'negrito itálico',
      'http',
      'https',
      'mail',
      'um',
      'dois',
    ]);
  });

  it.each([
    ['título', { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'x' }] }],
    ['citação', { type: 'blockquote', content: [p('x')] }],
    ['"Minha teoria"', { type: 'theory', content: [p('x')] }],
    ['divisória de capítulo', { type: 'chapterDivider', attrs: { chapter: 1 } }],
    ['imagem', { type: 'image', attrs: { src: 'https://exemplo.com/a.png' } }],
    ['bloco de código', { type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }],
    ['HTML cru', { type: 'html', content: '<script>alert(1)</script>' }],
    ['lista numerada', { type: 'orderedList', content: [{ type: 'listItem', content: [p('x')] }] }],
    [
      'lista aninhada',
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              p('x'),
              { type: 'bulletList', content: [{ type: 'listItem', content: [p('y')] }] },
            ],
          },
        ],
      },
    ],
    [
      'item com dois parágrafos',
      { type: 'bulletList', content: [{ type: 'listItem', content: [p('a'), p('b')] }] },
    ],
    ['lista vazia', { type: 'bulletList', content: [] }],
  ])('recusa %s', (_label, block) => {
    expect(pathsOf(valid({ intro: doc(block) }))).toEqual(['intro']);
    expect(pathsOf(valid({ sections: [{ title: 'S', body: doc(block) }] }))).toEqual([
      'sections.0.body',
    ]);
  });

  it.each([
    ['sublinhado', [{ type: 'underline' }]],
    ['tachado', [{ type: 'strike' }]],
    ['código', [{ type: 'code' }]],
    ['link javascript:', link('javascript:alert(1)')],
    ['link data:', link('data:text/html,x')],
    ['link vazio', link('')],
    ['link com espaço', link('https://exemplo.com/a b')],
  ])('recusa a marca %s', (_label, marks) => {
    expect(pathsOf(valid({ intro: doc(p('texto', marks)) }))).toEqual(['intro']);
  });

  it('recusa um atributo ou uma chave que não está na lista (strictObject)', () => {
    expect(pathsOf(valid({ intro: { type: 'doc', content: [], extra: 1 } }))).toEqual(['intro']);
    expect(pathsOf(valid({ intro: doc({ type: 'paragraph', attrs: { x: 1 } }) }))).toEqual([
      'intro',
    ]);
    expect(pathsOf(valid({ intro: { type: 'paragraph' } }))).toEqual(['intro']);
  });

  it('um corpo com <script> é só texto: passa e continua literal (a página o mostra escapado)', () => {
    const content = ok(valid({ intro: doc(p('<script>alert(1)</script>')) }));
    expect(richDocText(content.intro as RichDoc)).toBe('<script>alert(1)</script>');
    // Nos campos simples também é só texto.
    expect(ok(valid({ title: '<img src=x onerror=alert(1)>' })).title).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('na forma guardada o link só tem o href', () => {
    const content = ok(
      valid({
        intro: doc(
          p('x', [
            {
              type: 'link',
              attrs: {
                href: 'https://exemplo.com',
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
                class: null,
              },
            },
          ]),
        ),
      }),
    );
    expect(JSON.stringify(content.intro)).toContain('"attrs":{"href":"https://exemplo.com"}');
    expect(JSON.stringify(content.intro)).not.toContain('target');
  });

  it('texto vazio: o rascunho aceita; para publicar a abertura e as seções precisam de texto', () => {
    const empty = doc();
    ok(valid({ intro: empty }));
    expect(pathsOf(valid({ intro: empty }), { forPublish: true })).toEqual(['intro']);
    expect(
      pathsOf(valid({ sections: [{ title: 'S', body: doc(p('   ')) }] }), { forPublish: true }),
    ).toEqual(['sections.0.body']);
    ok(valid({ sections: [{ title: 'S', body: doc(p('texto')) }] }), { forPublish: true });
    expect(isRichDocEmpty({ type: 'doc', content: [] })).toBe(true);
  });
});

describe('estrutura, tamanho e profundidade', () => {
  it('recusa o que não é um objeto, chave desconhecida e versão diferente', () => {
    for (const input of [null, undefined, 'texto', 42, [], true]) {
      expect(bad(input).issue).toBe('invalid');
    }
    expect(pathsOf({ ...defaultAbout(), extra: 1 })).toEqual(['']);
    expect(bad(valid({ v: 2 as never })).issue).toBe('invalid');
    const semTitulo: Partial<AboutContent> = defaultAbout();
    delete semTitulo.title;
    expect(bad(semTitulo).issue).toBe('invalid');
  });

  it('tamanho: acima de 128 KB é recusado ANTES de validar', () => {
    const big = doc(p('a'.repeat(ABOUT_LIMITS.maxBytes)));
    expect(bad(valid({ intro: big })).issue).toBe('too_large');
    ok(valid({ intro: doc(p('a'.repeat(ABOUT_LIMITS.maxBytes - 4000))) }));
  });

  it('profundidade: uma lista dentro de lista dentro de lista… é recusada sem estourar a pilha', () => {
    let node: unknown = p('fundo');
    for (let i = 0; i < 50; i++) {
      node = { type: 'bulletList', content: [{ type: 'listItem', content: [node] }] };
    }
    expect(bad(valid({ intro: doc(node) })).issue).toBe('too_deep');
  });
});

describe('o que a administração não pode mudar', () => {
  it('o conteúdo não tem campo para os combinados, o nome da autora nem o visual (cores, fontes, HTML)', () => {
    const keys = Object.keys(defaultAbout()).sort();
    expect(keys).toEqual(
      [
        'bio',
        'cta',
        'howItWorks',
        'intro',
        'links',
        'photo',
        'sections',
        'stats',
        'title',
        'v',
      ].sort(),
    );
    for (const extra of [
      'rules',
      'combinados',
      'author',
      'authorName',
      'theme',
      'colors',
      'html',
      'css',
    ]) {
      expect(pathsOf({ ...defaultAbout(), [extra]: 'x' })).toEqual(['']);
    }
  });
});
