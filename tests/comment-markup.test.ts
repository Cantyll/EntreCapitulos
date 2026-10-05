import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(public)/comment-actions', () => ({
  createComment: vi.fn(),
  loadMoreComments: vi.fn(),
}));

const { CommentBody, CommentThread } = await import('@/components/comments/CommentItem');
import type { ReplyContext } from '@/components/comments/CommentItem';
import type { DisplayComment } from '@/lib/comments/display';

/*
 * O comentário no HTML. O texto é SEMPRE texto (HTML escapado, sem link clicável). Coberto por spoiler, o
 * texto continua na página (cortesia, não trava), mas `inert` + `aria-hidden`, e o botão de mostrar fica
 * FORA da área inerte. O autor nunca vê o próprio comentário coberto.
 */

const base: DisplayComment = {
  id: 'c1',
  authorName: 'Ana Souza',
  authorRole: 'member',
  body: 'Texto do comentário',
  readUpTo: 12,
  spoilerUpTo: null,
  pending: false,
  isOwn: false,
  createdAt: '2026-09-29T15:00:00+00:00',
  timeText: 'há 2 dias',
  replies: [],
  repliesTruncated: false,
};

const reply: ReplyContext = {
  sessionId: 's1',
  chapterTo: 12,
  spoilerChoices: [13, 14],
  welcomeHref: '/boas-vindas',
  canReply: true,
};

const body = (comment: Partial<DisplayComment>, progress: number, known = true) =>
  renderToStaticMarkup(
    createElement(CommentBody, {
      comment: { ...base, ...comment },
      progress,
      progressKnown: known,
    }),
  );

describe('cobertura do comentário', () => {
  it('coberto: texto no HTML, inert + aria-hidden, e botão fora da área inerte', () => {
    const html = body({ spoilerUpTo: 15, body: 'Segredo do capítulo 15' }, 12);
    expect(html).toContain('Segredo do capítulo 15');
    expect(html).toMatch(/inert=""/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls=');
    expect(html).toContain('Spoiler até o capítulo 15');
    // O botão vem ANTES da área coberta (não está dentro dela).
    expect(html.indexOf('<button')).toBeLessThan(html.indexOf('inert'));
    const covered = html.slice(html.indexOf('<div'));
    expect(covered).not.toContain('<button');
  });

  it('o botão aponta para o texto coberto (aria-controls = id)', () => {
    const html = body({ spoilerUpTo: 15 }, 12);
    const controls = /aria-controls="([^"]+)"/.exec(html)![1]!;
    expect(html).toContain(`id="${controls}"`);
  });

  it('progresso igual ou maior que a marca: sem cobertura, com a etiqueta', () => {
    for (const progress of [15, 40]) {
      const html = body({ spoilerUpTo: 15 }, progress);
      expect(html).not.toMatch(/inert/);
      expect(html).not.toContain('aria-expanded');
      expect(html).toContain('spoiler do cap. 15');
    }
  });

  it('progresso desconhecido (0) cobre e diz que a pessoa ainda não marcou até onde leu', () => {
    const html = body({ spoilerUpTo: 1 }, 0, false);
    expect(html).toMatch(/inert=""/);
    expect(html).toContain('ainda não marcou até onde leu');
  });

  it('sem marca de spoiler nunca cobre', () => {
    const html = body({ spoilerUpTo: null }, 0, false);
    expect(html).not.toMatch(/inert/);
    expect(html).not.toContain('spoiler do cap.');
  });

  it('o AUTOR nunca vê o próprio comentário coberto', () => {
    const html = body({ spoilerUpTo: 30, isOwn: true }, 0, false);
    expect(html).not.toMatch(/inert/);
    expect(html).not.toContain('aria-expanded');
  });
});

describe('o texto é texto', () => {
  it('<script> e <img onerror> saem escapados, nunca como elementos', () => {
    const html = body({ body: '<script>alert(1)</script><img src=x onerror=alert(1)>' }, 12);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
  });

  it('um link no texto não vira <a>', () => {
    const html = body({ body: 'veja https://exemplo.com e www.exemplo.com' }, 12);
    expect(html).toContain('https://exemplo.com');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href=');
  });

  it('quebras de linha ficam no texto (o CSS usa pre-wrap)', () => {
    expect(body({ body: 'linha 1\nlinha 2' }, 12)).toContain('linha 1\nlinha 2');
  });
});

const thread = (comment: Partial<DisplayComment>, canReply = true) =>
  renderToStaticMarkup(
    createElement(CommentThread, {
      comment: { ...base, ...comment },
      progress: 12,
      progressKnown: true,
      reply: { ...reply, canReply },
    }),
  );

describe('a conversa', () => {
  it('cabeçalho: nome, selo de Administração e de Moderação, chip "leu até", tempo e âncora', () => {
    const html = thread({ authorRole: 'admin', id: 'abc' });
    expect(html).toContain('Ana Souza');
    expect(html).toContain('Administração');
    expect(html).toContain('leu até o cap. 12');
    expect(html).toContain('há 2 dias');
    expect(html).toContain('id="comentario-abc"');
    expect(thread({ authorRole: 'moderator' })).toContain('Moderação');
    expect(thread({ authorRole: 'member' })).not.toContain('Moderação');
    expect(html).not.toContain('Autora');
  });

  it('sem "leu até" quando não se sabe', () => {
    expect(thread({ readUpTo: null })).not.toContain('leu até o cap.');
  });

  it('pendente: selo "Em análise" e sem botão de responder', () => {
    const html = thread({ pending: true });
    expect(html).toContain('Em análise');
    expect(html).not.toContain('Responder');
  });

  it('o botão Responder diz a quem responde e some quando não dá para responder', () => {
    expect(thread({})).toContain('aria-label="Responder a Ana Souza"');
    expect(thread({}, false)).not.toContain('Responder');
  });

  it('respostas ficam numa lista própria, com nome acessível', () => {
    const html = thread({
      replies: [{ ...base, id: 'r1', authorName: 'Bia', body: 'Resposta da Bia' }],
    });
    expect(html).toContain('aria-label="Respostas a Ana Souza"');
    expect(html).toContain('Resposta da Bia');
    expect(html).toContain('id="comentario-r1"');
  });

  it('mais de 100 respostas: o aviso aparece em vez de cortar em silêncio', () => {
    expect(thread({ repliesTruncated: true, replies: [{ ...base, id: 'r1' }] })).toContain(
      'Mostrando as 100 primeiras respostas.',
    );
    expect(thread({ replies: [{ ...base, id: 'r1' }] })).not.toContain('Mostrando as 100');
  });
});
