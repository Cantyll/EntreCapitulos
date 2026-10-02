import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from '@/lib/site';

import {
  COMMENT_MAX_LENGTH,
  classifyCommentError,
  classifyModerationError,
  commentLength,
  compareTimestamps,
  isCommentCovered,
  mergeThread,
  nextCursor,
  normalizeCommentBody,
  pageCount,
  pageRange,
  parseCommentOrder,
  parseCursor,
  parseModerationTab,
  parsePageNumber,
  parseSpoilerUpTo,
  parseVisibleIds,
  spoilerChoices,
  unflaggedPending,
  validateCommentBody,
} from './index';
import { countCovered, toDisplayThread } from './display';
import type { CommentRecord, CommentWithReplies } from './types';

describe('normalizeCommentBody', () => {
  it('normaliza as quebras de linha e apara as pontas', () => {
    expect(normalizeCommentBody('  oi\r\nmundo\r  ')).toBe('oi\nmundo');
  });

  it('no máximo uma linha em branco seguida', () => {
    expect(normalizeCommentBody('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('tira controle e invisíveis (zero-width, bidi, hífen suave), mas mantém emoji e acento', () => {
    const dirty = 'ol​á\u0000 ‮mundo⁠﻿­ 💗';
    expect(normalizeCommentBody(dirty)).toBe('olá mundo 💗');
  });

  it('um link escondido por zero-width volta a ser um link visível', () => {
    expect(normalizeCommentBody('ht​tp://exemplo.com')).toBe('http://exemplo.com');
  });

  it('tab vira espaço e espaço no fim da linha some', () => {
    expect(normalizeCommentBody('a\t \nb')).toBe('a\nb');
  });

  it('o que não é texto vira vazio', () => {
    for (const value of [null, undefined, 12, {}, ['a']])
      expect(normalizeCommentBody(value)).toBe('');
  });

  it('é idempotente', () => {
    const once = normalizeCommentBody('  a\r\n\n\n​b ');
    expect(normalizeCommentBody(once)).toBe(once);
  });
});

describe('validateCommentBody', () => {
  it('recusa vazio e só espaço/invisível', () => {
    for (const value of ['', '   ', '\n\n', '​​', null]) {
      expect(validateCommentBody(value)).toMatchObject({ ok: false, error: 'empty' });
    }
  });

  it('aceita de 1 a 2000 caracteres e recusa 2001', () => {
    expect(validateCommentBody('a')).toEqual({ ok: true, body: 'a' });
    expect(validateCommentBody('a'.repeat(COMMENT_MAX_LENGTH)).ok).toBe(true);
    expect(validateCommentBody('a'.repeat(COMMENT_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      error: 'too_long',
    });
  });

  it('conta por code point, como o banco: 2000 emojis cabem', () => {
    const emojis = '💗'.repeat(2000);
    expect(emojis.length).toBe(4000);
    expect(commentLength(emojis)).toBe(2000);
    expect(validateCommentBody(emojis).ok).toBe(true);
    expect(validateCommentBody(emojis + '💗').ok).toBe(false);
  });

  it('um corpo com <script> ou <img onerror> segue como texto, intacto', () => {
    const body = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    expect(validateCommentBody(body)).toEqual({ ok: true, body });
  });
});

describe('parseSpoilerUpTo', () => {
  it('vazio, nulo e "0" são "sem spoiler"', () => {
    for (const raw of [null, undefined, '', '0']) {
      expect(parseSpoilerUpTo(raw, 12, 52)).toEqual({ ok: true, value: null });
    }
  });

  it('aceita de chapter_to+1 até o total', () => {
    expect(parseSpoilerUpTo('13', 12, 52)).toEqual({ ok: true, value: 13 });
    expect(parseSpoilerUpTo(52, 12, 52)).toEqual({ ok: true, value: 52 });
  });

  it.each([12, 11, 53, 1.5, '1.5', '-3', 'abc', '13abc', NaN, Infinity, {}, [], true])(
    'recusa %j',
    (raw) => {
      expect(parseSpoilerUpTo(raw, 12, 52)).toEqual({ ok: false });
    },
  );

  it('sessão que termina no último capítulo não tem o que marcar', () => {
    expect(spoilerChoices(52, 52)).toEqual([]);
    expect(parseSpoilerUpTo('53', 52, 52)).toEqual({ ok: false });
    expect(spoilerChoices(50, 52)).toEqual([51, 52]);
  });

  it('o teto do banco (1000) vale mesmo com um total maior', () => {
    expect(parseSpoilerUpTo('1001', 12, 5000)).toEqual({ ok: false });
    expect(parseSpoilerUpTo('1000', 12, 5000)).toEqual({ ok: true, value: 1000 });
  });
});

describe('isCommentCovered', () => {
  it('coberto quando spoiler_up_to > progresso', () => {
    expect(isCommentCovered({ spoilerUpTo: 15, progress: 12, isAuthor: false })).toBe(true);
    expect(isCommentCovered({ spoilerUpTo: 15, progress: 15, isAuthor: false })).toBe(false);
    expect(isCommentCovered({ spoilerUpTo: 15, progress: 20, isAuthor: false })).toBe(false);
  });

  it('progresso desconhecido (0) cobre qualquer marca', () => {
    expect(isCommentCovered({ spoilerUpTo: 1, progress: 0, isAuthor: false })).toBe(true);
  });

  it('sem marca nunca cobre', () => {
    expect(isCommentCovered({ spoilerUpTo: null, progress: 0, isAuthor: false })).toBe(false);
  });

  it('o autor nunca vê o próprio comentário coberto', () => {
    expect(isCommentCovered({ spoilerUpTo: 30, progress: 0, isAuthor: true })).toBe(false);
  });
});

describe('ordem, cursor e página', () => {
  it('ordem: só "antigos" muda o padrão', () => {
    expect(parseCommentOrder('antigos')).toBe('antigos');
    expect(parseCommentOrder(['antigos', 'x'])).toBe('antigos');
    for (const raw of [undefined, 'recentes', 'x', '', 3])
      expect(parseCommentOrder(raw)).toBe('recentes');
  });

  const id = '4f1c2a9e-1b2c-4d3e-8f4a-5b6c7d8e9f00';

  it('o cursor aceita o texto do Postgres, com microssegundos, e o devolve intacto', () => {
    const createdAt = '2026-09-29T15:00:00.123456+00:00';
    expect(parseCursor({ createdAt, id })).toEqual({ createdAt, id });
    expect(parseCursor({ createdAt: '2026-09-29T15:00:00+00:00', id })).not.toBeNull();
    expect(parseCursor({ createdAt: '2026-09-29T15:00:00Z', id })).not.toBeNull();
  });

  it.each([
    null,
    'texto',
    {},
    { createdAt: '2026-09-29', id },
    { createdAt: '2026-09-29T15:00:00.1234567+00:00', id },
    { createdAt: "2026-09-29T15:00:00+00:00',id.eq.x", id },
    { createdAt: '2026-09-29T15:00:00+00:00', id: 'não-é-uuid' },
    { createdAt: '2026-09-29T15:00:00+00:00', id: `${id},status.eq.removed` },
    { createdAt: 20260929, id },
  ])('o cursor recusa %j', (raw) => {
    expect(parseCursor(raw)).toBeNull();
  });

  it('compara timestamps com microssegundos sem perder precisão', () => {
    const a = '2026-09-29T15:00:00.000001+00:00';
    const b = '2026-09-29T15:00:00.000002+00:00';
    // Com `Date` os dois seriam iguais.
    expect(new Date(a).getTime()).toBe(new Date(b).getTime());
    expect(compareTimestamps(a, b)).toBe(-1);
    expect(compareTimestamps(b, a)).toBe(1);
    expect(compareTimestamps(a, a)).toBe(0);
  });

  it('fração ausente é zero e fração mais curta é completada', () => {
    expect(compareTimestamps('2026-09-29T15:00:00+00:00', '2026-09-29T15:00:00.5+00:00')).toBe(-1);
    expect(compareTimestamps('2026-09-29T15:00:00.5+00:00', '2026-09-29T15:00:00.25+00:00')).toBe(
      1,
    );
    expect(compareTimestamps('2026-09-29T15:00:00Z', '2026-09-29T15:00:00.000000+00:00')).toBe(0);
  });

  it('o próximo cursor só existe quando há mais páginas', () => {
    const items = [
      { createdAt: '2026-09-29T15:00:00+00:00', id: 'a' },
      { createdAt: '2026-09-29T14:00:00+00:00', id: 'b' },
    ];
    expect(nextCursor(items, true)).toEqual(items[1]);
    expect(nextCursor(items, false)).toBeNull();
    expect(nextCursor([], true)).toBeNull();
  });
});

const rec = (over: Partial<CommentRecord> & { id: string; createdAt: string }): CommentRecord => ({
  parentId: null,
  authorId: 'u1',
  authorName: 'Ana',
  authorRole: 'member',
  body: 'texto',
  readUpTo: 3,
  spoilerUpTo: null,
  status: 'approved',
  ...over,
});
const top = (
  over: Partial<CommentRecord> & { id: string; createdAt: string },
): CommentWithReplies => ({
  ...rec(over),
  replies: [],
  repliesTruncated: false,
});

describe('mergeThread', () => {
  const t = (n: number) => `2026-09-29T${String(n).padStart(2, '0')}:00:00+00:00`;
  // Página "recentes": do mais novo para o mais velho.
  const page = [
    top({ id: 'c3', createdAt: t(15) }),
    top({ id: 'c2', createdAt: t(12) }),
    top({ id: 'c1', createdAt: t(9) }),
  ];

  it('sem pendentes, devolve a página como veio', () => {
    const out = mergeThread({
      page,
      hasMore: false,
      ownPending: [],
      order: 'recentes',
      after: null,
    });
    expect(out.map((c) => c.id)).toEqual(['c3', 'c2', 'c1']);
  });

  it('o pendente do próprio autor entra na ordem certa (recentes)', () => {
    const own = rec({ id: 'p1', createdAt: t(13), status: 'pending' });
    const out = mergeThread({
      page,
      hasMore: false,
      ownPending: [own],
      order: 'recentes',
      after: null,
    });
    expect(out.map((c) => c.id)).toEqual(['c3', 'p1', 'c2', 'c1']);
    expect(out[1]!.status).toBe('pending');
  });

  it('ordem "antigos": do mais velho para o mais novo, e o pendente vai para o lugar dele', () => {
    const asc = [...page].reverse();
    const own = rec({ id: 'p1', createdAt: t(13), status: 'pending' });
    const out = mergeThread({
      page: asc,
      hasMore: false,
      ownPending: [own],
      order: 'antigos',
      after: null,
    });
    expect(out.map((c) => c.id)).toEqual(['c1', 'c2', 'p1', 'c3']);
  });

  it('com mais páginas, o pendente mais velho que o último item fica para a página dele', () => {
    const older = rec({ id: 'p0', createdAt: t(3), status: 'pending' });
    const newer = rec({ id: 'p9', createdAt: t(20), status: 'pending' });
    const out = mergeThread({
      page,
      hasMore: true,
      ownPending: [older, newer],
      order: 'recentes',
      after: null,
    });
    expect(out.map((c) => c.id)).toEqual(['p9', 'c3', 'c2', 'c1']);
  });

  it('numa página seguinte, o pendente mais novo que o cursor já saiu antes', () => {
    const after = { createdAt: t(20), id: 'x' };
    const newer = rec({ id: 'p9', createdAt: t(21), status: 'pending' });
    const inRange = rec({ id: 'p5', createdAt: t(10), status: 'pending' });
    const out = mergeThread({
      page,
      hasMore: false,
      ownPending: [newer, inRange],
      order: 'recentes',
      after,
    });
    expect(out.map((c) => c.id)).toEqual(['c3', 'c2', 'p5', 'c1']);
  });

  it('empate no mesmo instante desempata pelo id, como o banco', () => {
    const same = [top({ id: 'b', createdAt: t(9) }), top({ id: 'a', createdAt: t(9) })];
    const out = mergeThread({
      page: same,
      hasMore: false,
      ownPending: [],
      order: 'recentes',
      after: null,
    });
    expect(out.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('as respostas ficam da mais antiga para a mais nova', () => {
    const withReplies = [
      {
        ...top({ id: 'c1', createdAt: t(9) }),
        replies: [
          rec({ id: 'r2', parentId: 'c1', createdAt: t(11) }),
          rec({ id: 'r1', parentId: 'c1', createdAt: t(10) }),
        ],
      },
    ];
    const out = mergeThread({
      page: withReplies,
      hasMore: false,
      ownPending: [],
      order: 'recentes',
      after: null,
    });
    expect(out[0]!.replies.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('a resposta pendente do autor entra embaixo do pai aprovado da página', () => {
    const reply = rec({ id: 'rp', parentId: 'c2', createdAt: t(14), status: 'pending' });
    const out = mergeThread({
      page,
      hasMore: false,
      ownPending: [reply],
      order: 'recentes',
      after: null,
    });
    expect(out.find((c) => c.id === 'c2')!.replies.map((r) => r.id)).toEqual(['rp']);
  });

  it('resposta de um pai que não está na página (removido, ou em outra página) não aparece como órfã', () => {
    const orphan = rec({ id: 'ro', parentId: 'removido', createdAt: t(14), status: 'pending' });
    const out = mergeThread({
      page,
      hasMore: false,
      ownPending: [orphan],
      order: 'recentes',
      after: null,
    });
    const everyId = out.flatMap((c) => [c.id, ...c.replies.map((r) => r.id)]);
    expect(everyId).not.toContain('ro');
  });

  it('uma resposta nunca entra embaixo de um pai que ainda está pendente', () => {
    const parent = rec({ id: 'pp', createdAt: t(13), status: 'pending' });
    const reply = rec({ id: 'rr', parentId: 'pp', createdAt: t(14), status: 'pending' });
    const out = mergeThread({
      page,
      hasMore: false,
      ownPending: [parent, reply],
      order: 'recentes',
      after: null,
    });
    expect(out.find((c) => c.id === 'pp')!.replies).toEqual([]);
  });

  it('não altera os dados de entrada', () => {
    const input = [top({ id: 'c1', createdAt: t(9) })];
    const own = rec({ id: 'rp', parentId: 'c1', createdAt: t(10), status: 'pending' });
    mergeThread({ page: input, hasMore: false, ownPending: [own], order: 'recentes', after: null });
    expect(input[0]!.replies).toEqual([]);
  });
});

describe('erros do banco', () => {
  it.each([
    ['profile_incomplete: choose the name', '23514', 'profile_incomplete'],
    ['session_not_published: only', '23514', 'session_not_published'],
    ['comments_closed: not accepting', '23514', 'comments_closed'],
    ['invalid_parent: replies go', '23514', 'invalid_parent'],
  ])('%s', (message, code, key) => {
    expect(classifyCommentError({ message, code })).toBe(key);
  });

  it('RLS (sem sessão ou anônimo), chave estrangeira e o resto', () => {
    expect(
      classifyCommentError({ code: '42501', message: 'new row violates row-level security' }),
    ).toBe('not_signed_in');
    expect(classifyCommentError({ code: '23503', message: 'fk' })).toBe('invalid_parent');
    expect(classifyCommentError({ code: '08006', message: 'x' })).toBe('generic');
    expect(classifyCommentError(null)).toBe('generic');
  });

  it('a moderação: sem permissão e o resto', () => {
    expect(classifyModerationError({ code: '42501' })).toBe('forbidden');
    expect(classifyModerationError({ code: 'XX000' })).toBe('generic');
  });
});

describe('moderação, parâmetros e "Aprovar os sem alerta"', () => {
  it('aba e página', () => {
    expect(parseModerationTab('aprovados')).toBe('aprovados');
    expect(parseModerationTab('removidos')).toBe('removidos');
    for (const raw of [undefined, 'x', 'denuncias', ''])
      expect(parseModerationTab(raw)).toBe('pendentes');
    expect(parsePageNumber('3')).toBe(3);
    for (const raw of [undefined, '0', '-1', '1.5', 'a', '123456', ''])
      expect(parsePageNumber(raw)).toBe(1);
    expect(pageRange(1)).toEqual({ from: 0, to: 19 });
    expect(pageRange(3)).toEqual({ from: 40, to: 59 });
    expect(pageCount(0)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
  });

  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  it('os ids visíveis: só uuid válido, sem repetição, no máximo uma página', () => {
    expect(parseVisibleIds([id(1), id(1), 'x', 5, id(2).toUpperCase()])).toEqual([id(1), id(2)]);
    expect(parseVisibleIds('nada')).toEqual([]);
    const many = Array.from({ length: 50 }, (_, i) => id(i + 1));
    expect(parseVisibleIds(many)).toHaveLength(20);
  });

  it('só aprova o que o servidor confirma como pendente e sem flag, e ignora o resto', () => {
    const rows = [
      { id: id(1), status: 'pending', hasFlag: false },
      { id: id(2), status: 'pending', hasFlag: true },
      { id: id(3), status: 'approved', hasFlag: false },
      { id: id(4), status: 'removed', hasFlag: false },
      { id: id(5), status: 'pending', hasFlag: false },
    ];
    // O cliente diz ver 1, 2, 3, 4, 6 (o 6 nem existe) e NÃO mandou o 5.
    const visible = [id(1), id(2), id(3), id(4), id(6)];
    expect(unflaggedPending(visible, rows)).toEqual([id(1)]);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-02T15:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;

  it('faixas', () => {
    expect(formatRelativeTime(ago(10_000), now)).toBe('agora');
    expect(formatRelativeTime(ago(5 * min), now)).toBe('há 5 min');
    expect(formatRelativeTime(ago(59 * min), now)).toBe('há 59 min');
    expect(formatRelativeTime(ago(hour), now)).toBe('há 1 hora');
    expect(formatRelativeTime(ago(5 * hour), now)).toBe('há 5 horas');
    expect(formatRelativeTime(ago(day + hour), now)).toBe('ontem');
    expect(formatRelativeTime(ago(4 * day), now)).toBe('há 4 dias');
  });

  it('a partir de uma semana vira data; com o ano se for de outro ano', () => {
    expect(formatRelativeTime('2026-09-13T15:00:00Z', now)).toBe('13 de setembro');
    expect(formatRelativeTime('2025-12-24T15:00:00Z', now)).toBe('24 de dezembro de 2025');
  });

  it('data inválida vira vazio, e um instante no futuro (relógio torto) vira "agora"', () => {
    expect(formatRelativeTime('não é data', now)).toBe('');
    expect(formatRelativeTime(new Date(now.getTime() + 5 * min), now)).toBe('agora');
  });
});

describe('toDisplayThread e countCovered', () => {
  const now = new Date('2026-10-02T15:00:00Z');
  const t = '2026-10-01T15:00:00+00:00';
  const page: CommentWithReplies[] = [
    {
      ...top({ id: 'c1', createdAt: t, authorId: 'me', spoilerUpTo: 20, readUpTo: 0 }),
      replies: [
        rec({
          id: 'r1',
          parentId: 'c1',
          createdAt: t,
          authorId: 'other',
          spoilerUpTo: 30,
          readUpTo: 5,
        }),
      ],
      repliesTruncated: true,
    },
  ];

  it('"é meu" vem do id de quem vê, e o id de quem vê não vai para a tela', () => {
    const [thread] = toDisplayThread(page, 'me', now);
    expect(thread!.isOwn).toBe(true);
    expect(thread!.replies[0]!.isOwn).toBe(false);
    expect(JSON.stringify(thread)).not.toContain('"authorId"');
    expect(toDisplayThread(page, null, now)[0]!.isOwn).toBe(false);
  });

  it('tempo relativo já calculado, "leu até" 0 some e o aviso de respostas cortadas passa', () => {
    const [thread] = toDisplayThread(page, 'me', now);
    expect(thread!.timeText).toBe('ontem');
    expect(thread!.readUpTo).toBeNull();
    expect(thread!.replies[0]!.readUpTo).toBe(5);
    expect(thread!.repliesTruncated).toBe(true);
  });

  it('pendente vira boolean', () => {
    const pending = [top({ id: 'p', createdAt: t, status: 'pending' })];
    expect(toDisplayThread(pending, 'u1', now)[0]!.pending).toBe(true);
  });

  it('conta os cobertos, respostas incluídas, e o autor não conta', () => {
    const items = toDisplayThread(page, 'me', now);
    const covered = (c: (typeof items)[number]) =>
      isCommentCovered({ spoilerUpTo: c.spoilerUpTo, progress: 12, isAuthor: c.isOwn });
    // c1 é meu (não cobre); a resposta r1 (cap. 30) cobre.
    expect(countCovered(items, covered)).toBe(1);
    const visitor = toDisplayThread(page, null, now);
    expect(countCovered(visitor, covered)).toBe(2);
  });
});
