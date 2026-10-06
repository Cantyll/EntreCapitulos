import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMUNITY_RULES } from '@/content/legal/community-rules';
import { aboutFacts, defaultAbout, type AboutContent, type RichDoc } from '@/lib/about';

/*
 * A página Sobre no HTML: o conteúdo editável só vira TEXTO (um <script> digitado aparece escapado), os links só
 * são https de verdade e com rel noopener, o que a administração oculta some, e os Combinados e "Leia como aplicativo"
 * continuam aparecendo sempre, vindos do código (não do conteúdo editável).
 */

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const rest = { ...props };
    delete rest.unoptimized;
    return createElement('img', rest);
  },
}));

const { AboutView } = await import('@/components/sobre/AboutView');

const UUID = '0b9f5f00-1111-4222-8333-444455556666';
const doc = (...texts: string[]): RichDoc => ({
  type: 'doc',
  content: texts.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

const render = (patch: Partial<AboutContent> = {}, facts = aboutFacts(2, 14), showCta = true) =>
  renderToStaticMarkup(
    createElement(AboutView, { content: { ...defaultAbout(), ...patch }, facts, showCta }),
  );

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
});

/** A ordem dos blocos marcados com data-about, sem repetir seguidos. */
const order = (html: string) => {
  const out: string[] = [];
  for (const match of html.matchAll(/data-about="([a-z]+)"/g)) {
    if (out.at(-1) !== match[1]) out.push(match[1]!);
  }
  return out;
};

describe('AboutView', () => {
  it('com o conteúdo padrão, a ordem é: apresentação, texto, Como funciona, estatísticas, Combinados, app e chamada', () => {
    expect(order(render())).toEqual([
      'presentation',
      'text',
      'how',
      'stats',
      'rules',
      'app',
      'cta',
    ]);
  });

  it('com as seções extras, elas vêm depois do texto e antes de "Como funciona", na ordem escolhida', () => {
    const html = render({
      sections: [
        { title: 'Primeira seção', body: doc('um') },
        { title: 'Segunda seção', body: doc('dois') },
      ],
    });
    expect(order(html)).toEqual([
      'presentation',
      'text',
      'sections',
      'how',
      'stats',
      'rules',
      'app',
      'cta',
    ]);
    expect(html.indexOf('Primeira seção')).toBeLessThan(html.indexOf('Segunda seção'));
  });

  it('o texto do conteúdo é texto: <script> e <img onerror> saem escapados, em qualquer campo', () => {
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const html = render({
      title: evil,
      bio: evil,
      intro: doc(evil),
      sections: [{ title: evil, body: doc(evil) }],
      links: [{ label: evil, url: 'https://exemplo.com' }],
      howItWorks: { visible: true, steps: [{ title: evil, text: evil }] },
      cta: { visible: true, text: evil },
      photo: { path: `site/sobre/${UUID}.webp`, alt: evil },
    });
    expect(html).not.toContain('<script>alert(1)');
    // O único <img> é o da foto, e nenhum atributo dele é um manipulador de evento (o texto malicioso, no alt,
    // está escapado dentro do valor).
    const tags = html.match(/<img\b[^>]*>/g) ?? [];
    expect(tags).toHaveLength(1);
    const names = [...tags[0]!.matchAll(/\s([a-zA-Z-]+)="/g)].map((m) => m[1]!.toLowerCase());
    expect(names.filter((name) => name.startsWith('on'))).toEqual([]);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x');
  });

  it('links: só https de verdade, com rel noopener noreferrer e abrindo em outra aba', () => {
    const html = render({
      links: [
        { label: 'Meu blog', url: 'https://blog.exemplo.com/a?b=1' },
        // O conteúdo do banco poderia ter algo que passou da validação: a página não desenha.
        { label: 'Perigoso', url: 'javascript:alert(1)' },
        { label: 'Sem criptografia', url: 'http://exemplo.com' },
        { label: 'Com senha', url: 'https://u:p@exemplo.com' },
      ],
    });
    expect(html).toContain('href="https://blog.exemplo.com/a?b=1"');
    expect(html).toMatch(
      /<a href="https:\/\/blog\.exemplo\.com\/a\?b=1" rel="noopener noreferrer" target="_blank">/,
    );
    for (const refused of [
      'Perigoso',
      'Sem criptografia',
      'Com senha',
      'javascript:',
      'http://exemplo.com',
    ]) {
      expect(html).not.toContain(refused);
    }
  });

  it('links do texto rico: http, https e mailto, sempre com rel noopener noreferrer; javascript: nunca', () => {
    const link = (text: string, href: string) => ({
      type: 'text' as const,
      text,
      marks: [{ type: 'link' as const, attrs: { href } }],
    });
    const html = render({
      intro: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              link('a', 'https://exemplo.com'),
              link('b', 'mailto:a@b.com'),
              link('c', 'javascript:alert(1)'),
            ],
          },
        ],
      },
    });
    expect(html).toContain('rel="noopener noreferrer" target="_blank">a</a>');
    expect(html).toContain('<a href="mailto:a@b.com" rel="noopener noreferrer">b</a>');
    expect(html).not.toContain('javascript:');
  });

  it('o que se oculta some: estatísticas, "Como funciona" e a chamada final', () => {
    const html = render({
      stats: { visible: false },
      howItWorks: { visible: false, steps: [{ title: 'Passo oculto', text: 'x' }] },
      cta: { visible: false, text: 'Texto da chamada oculta' },
    });
    expect(order(html)).toEqual(['presentation', 'text', 'rules', 'app']);
    expect(html).not.toContain('Como funciona');
    expect(html).not.toContain('Passo oculto');
    expect(html).not.toContain('O clube em números');
    expect(html).not.toContain('Texto da chamada oculta');
  });

  it('a chamada final só aparece para quem não está logado', () => {
    expect(render({}, aboutFacts(0, 0), true)).toContain('data-about="cta"');
    expect(render({}, aboutFacts(0, 0), false)).not.toContain('data-about="cta"');
  });

  it('estatísticas: só os números que não são zero, e o bloco some sem nenhum', () => {
    expect(render({}, aboutFacts(1, 1))).toContain('1</b>livro terminado');
    expect(render({}, aboutFacts(1, 1))).toContain('1</b>sessão publicada');
    const onlySessions = render({}, aboutFacts(0, 3));
    expect(onlySessions).toContain('3</b>sessões publicadas');
    expect(onlySessions).not.toContain('terminad');
    expect(order(render({}, aboutFacts(0, 0)))).not.toContain('stats');
  });

  it('os Combinados e "Leia como aplicativo" estão SEMPRE, vindos do código', () => {
    const html = render({
      stats: { visible: false },
      howItWorks: { visible: false, steps: [{ title: 'x', text: 'y' }] },
      cta: { visible: false, text: 'z' },
    });
    expect(html).toContain('Combinados da comunidade');
    for (const rule of COMMUNITY_RULES) {
      expect(html).toContain(rule.title);
      expect(html).toContain(rule.text);
    }
    expect(html).toContain('data-install-guide="about"');
  });

  it('o conteúdo editável não consegue trocar os Combinados: um conteúdo com chave "rules" não muda o bloco', () => {
    const html = render({ rules: [{ title: 'Regra falsa', text: 'Texto falso' }] } as never);
    expect(html).not.toContain('Regra falsa');
    expect(html).toContain('Conteúdo adequado');
  });

  it('sem foto, as iniciais; com foto, a imagem do bucket público com o texto alternativo', () => {
    expect(render()).not.toContain('<img');
    const html = render({ photo: { path: `site/sobre/${UUID}.webp`, alt: 'A Agatha sorrindo' } });
    expect(html).toContain(
      `src="https://abc.supabase.co/storage/v1/object/public/covers/site/sobre/${UUID}.webp"`,
    );
    expect(html).toContain('alt="A Agatha sorrindo"');
  });

  it('foto com caminho que não é o gerado pelo servidor: cai nas iniciais', () => {
    const html = render({ photo: { path: `books/${UUID}/${UUID}.webp`, alt: 'x' } });
    expect(html).not.toContain('<img');
  });

  it('o nome da autora vem do código (src/lib/site.ts), não do conteúdo', () => {
    expect(render()).toContain('Agatha Montinelli');
    expect(render({ title: 'Outro nome' })).toContain('Agatha Montinelli');
  });
});
