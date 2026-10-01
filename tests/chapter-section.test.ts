import type { ComponentProps, ComponentType } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CoverableBlock } from '@/components/public/Coverable';
import { SessionBody, type BodyDoc } from '@/lib/session-body';

/*
 * Cobertura de spoiler no HTML. O texto coberto CONTINUA na página (o filtro é uma cortesia de
 * leitura), mas com `inert` + `aria-hidden`, e o botão de mostrar fica FORA da área inerte.
 */

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const divider = (chapter: number, title?: string) => ({
  type: 'chapterDivider',
  attrs: title ? { chapter, title } : { chapter },
});
const doc = (...content: unknown[]) => ({ type: 'doc', content }) as unknown as BodyDoc;

const body = doc(
  p('Abertura sempre visível.'),
  divider(10, 'Título que entrega spoiler'),
  p('Texto do dez.'),
  divider(11, 'Outro título'),
  p('Texto do onze.'),
);

const render = (progress: number, known = true) =>
  renderToStaticMarkup(createElement(SessionBody, { doc: body, coverage: { progress, known } }));

const section = (html: string, chapter: number) =>
  html.match(new RegExp(`<section[^>]*data-chapter="${chapter}"[\\s\\S]*?</section>`))![0];

type BlockProps = Omit<ComponentProps<typeof CoverableBlock>, 'children'>;
const block = (props: BlockProps) =>
  createElement(
    CoverableBlock as ComponentType<BlockProps>,
    props,
    createElement('p', null, 'um trecho'),
  );

describe('ChapterSection no HTML', () => {
  it('capítulo coberto: conteúdo no HTML com inert e aria-hidden', () => {
    const s = section(render(9), 10);
    expect(s).toContain('Texto do dez.');
    expect(s).toMatch(
      /<div[^>]*\binert=""[^>]*aria-hidden="true"|<div[^>]*aria-hidden="true"[^>]*\binert=""/,
    );
  });

  it('capítulo descoberto: sem inert e sem aria-hidden, e sem botão', () => {
    const s = section(render(10), 10);
    expect(s).toContain('Texto do dez.');
    expect(s).not.toContain('inert');
    expect(s).not.toContain('aria-hidden');
    expect(s).not.toContain('<button');
  });

  it('o corte é por capítulo: com progresso 10, o 10 abre e o 11 fica coberto', () => {
    const html = render(10);
    expect(section(html, 10)).not.toContain('inert');
    expect(section(html, 11)).toContain('inert');
  });

  it('progresso 0 e desconhecido cobrem tudo; "Li o livro todo" não cobre nada', () => {
    expect(section(render(0), 10)).toContain('inert');
    expect(render(52)).not.toContain('inert');
  });

  it('a abertura nunca é coberta, nem com progresso 0', () => {
    const html = render(0);
    const opening = html.match(/<div[^>]*data-opening[\s\S]*?<\/div>/)![0];
    expect(opening).toContain('Abertura sempre visível.');
    expect(opening).not.toContain('inert');
  });

  it('título coberto não é desenhado (só "Capítulo N"); descoberto mostra o título', () => {
    const covered = section(render(9), 10);
    expect(covered).toContain('Capítulo 10');
    expect(covered).not.toContain('Título que entrega spoiler');
    expect(section(render(10), 10)).toContain('Título que entrega spoiler');
  });

  it('o botão fica fora da área inerte, com aria-expanded e aria-controls', () => {
    const s = section(render(9), 10);
    const inertArea = s.match(
      /<div id="([^"]+)"[^>]*inert[^>]*>([\s\S]*?)<\/div><div class="[^"]*veil/,
    )!;
    expect(inertArea[2]).not.toContain('<button');
    expect(s).toContain('aria-expanded="false"');
    expect(s).toContain(`aria-controls="${inertArea[1]}"`);
    expect(s).toContain('Mostrar o capítulo 10 mesmo assim');
  });

  it('mensagem muda quando o progresso é desconhecido', () => {
    expect(section(render(0, false), 10)).toContain('Você ainda não marcou até onde leu.');
    expect(section(render(4, true), 10)).toContain('Você marcou que leu até o capítulo 4.');
  });

  it('sem `coverage` (pré-visualização do editor) nada é coberto', () => {
    const html = renderToStaticMarkup(createElement(SessionBody, { doc: body }));
    expect(html).not.toContain('inert');
    expect(html).toContain('Título que entrega spoiler');
  });

  it('CoverableBlock (trechos e perguntas) usa a mesma cobertura', () => {
    const covered = renderToStaticMarkup(
      block({
        covered: true,
        progress: 3,
        progressKnown: true,
        buttonLabel: 'Mostrar mesmo assim',
      }),
    );
    expect(covered).toContain('um trecho');
    expect(covered).toContain('inert');
    expect(covered).toContain('aria-hidden="true"');
    const open = renderToStaticMarkup(
      block({ covered: false, progress: 12, progressKnown: true, buttonLabel: 'x' }),
    );
    expect(open).not.toContain('inert');
  });
});
