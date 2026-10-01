import { describe, expect, it } from 'vitest';

import { planProgressMigration } from './migrate';
import { parseBookParam, parseSessionNumber, parseShelfTab } from '@/lib/public/params';

import {
  PROGRESS_COOKIE_MAX_BOOKS,
  getProgress,
  parseProgressCookie,
  progressCookieOptions,
  serializeProgressCookie,
  withProgress,
} from './cookie';
import {
  UNKNOWN_PROGRESS,
  effectiveProgress,
  isChapterCovered,
  isExtrasCovered,
  isMarginNoteVisible,
  parseProgress,
} from './rules';

describe('regras de cobertura', () => {
  it('o capítulo N fica coberto se N > progresso', () => {
    expect(isChapterCovered(10, 9)).toBe(true);
    expect(isChapterCovered(10, 10)).toBe(false);
    expect(isChapterCovered(10, 12)).toBe(false);
    expect(isChapterCovered(1, 0)).toBe(true);
  });

  it('trechos e perguntas ficam cobertos enquanto progresso < chapter_to', () => {
    expect(isExtrasCovered(11, 12)).toBe(true);
    expect(isExtrasCovered(12, 12)).toBe(false);
    expect(isExtrasCovered(0, 3)).toBe(true);
    expect(isExtrasCovered(52, 12)).toBe(false);
  });

  it('anotações na margem: só de sessões que a pessoa já terminou', () => {
    expect(isMarginNoteVisible(12, 12)).toBe(true);
    expect(isMarginNoteVisible(11, 12)).toBe(false);
    expect(isMarginNoteVisible(0, 3)).toBe(false);
  });

  it('progresso desconhecido vale a constante (0)', () => {
    expect(UNKNOWN_PROGRESS).toBe(0);
    expect(effectiveProgress(null)).toBe(0);
    expect(effectiveProgress(7)).toBe(7);
    expect(effectiveProgress(0)).toBe(0);
  });

  it('com progresso desconhecido, todo capítulo fica coberto', () => {
    expect([1, 2, 3].every((c) => isChapterCovered(c, effectiveProgress(null)))).toBe(true);
  });
});

describe('parseProgress', () => {
  it.each([0, 1, 12, 52])('aceita %i com total 52', (n) => {
    expect(parseProgress(n, 52)).toBe(n);
  });

  it.each([-1, 53, 1.5, NaN, Infinity, '3', null, undefined, {}, [], true, 1001])(
    'recusa %j',
    (value) => {
      expect(parseProgress(value, 52)).toBeNull();
    },
  );

  it('o total do livro é o teto', () => {
    expect(parseProgress(5, 5)).toBe(5);
    expect(parseProgress(6, 5)).toBeNull();
    expect(parseProgress(0, 1)).toBe(0);
  });
});

describe('cookie de progresso', () => {
  it('ida e volta', () => {
    const map = { 'o-livro-de-azrael': 12, 'sal-e-cinza': 0 };
    expect(parseProgressCookie(serializeProgressCookie(map))).toEqual(map);
  });

  it.each([undefined, null, '', 'não é json', '{', '[]', '[1,2]', '"texto"', '42', 'null', 'true'])(
    'ignora %j',
    (raw) => {
      expect(parseProgressCookie(raw as string | undefined)).toEqual({});
    },
  );

  it('descarta entradas inválidas e mantém as boas', () => {
    const raw = JSON.stringify({
      'livro-bom': 5,
      'Livro Ruim': 3,
      'sem-capitulo': 'x',
      decimal: 1.5,
      negativo: -1,
      enorme: 5000,
      nulo: null,
      aninhado: { a: 1 },
      __proto__: 7,
      'a--b': 1,
      '-começa': 1,
    });
    expect(parseProgressCookie(raw)).toEqual({ 'livro-bom': 5 });
  });

  it('slug com caracteres perigosos ou longo demais é descartado', () => {
    const long = 'a'.repeat(81);
    const raw = JSON.stringify({ '../etc': 1, 'a b': 1, [long]: 1, ok: 2 });
    expect(parseProgressCookie(raw)).toEqual({ ok: 2 });
  });

  it('aceita no máximo 20 livros', () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`livro-${i}`, i]));
    const parsed = parseProgressCookie(JSON.stringify(many));
    expect(Object.keys(parsed)).toHaveLength(PROGRESS_COOKIE_MAX_BOOKS);
  });

  it('valor gigante é ignorado sem tentar o JSON.parse', () => {
    expect(parseProgressCookie(JSON.stringify({ a: 'x'.repeat(10_000) }))).toEqual({});
  });

  it('o resultado não herda de Object (sem poluição de protótipo)', () => {
    const parsed = parseProgressCookie('{"__proto__": 1, "constructor": 2, "ok": 3}');
    expect(Object.keys(parsed).sort()).toEqual(['constructor', 'ok']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // "constructor" é um slug válido: ler um livro sem progresso nunca devolve a função do protótipo.
    expect(getProgress({ ok: 3 }, 'constructor')).toBeNull();
    expect(getProgress({ ok: 3 }, 'toString')).toBeNull();
    expect(getProgress({ ok: 3 }, 'ok')).toBe(3);
  });

  describe('withProgress', () => {
    it('atualiza sem duplicar e leva o livro para o fim', () => {
      const out = withProgress({ a: 1, b: 2 }, 'a', 5);
      expect(Object.entries(out)).toEqual([
        ['b', 2],
        ['a', 5],
      ]);
    });

    it('passando de 20 livros, o mais antigo sai', () => {
      let map = {};
      for (let i = 0; i < 25; i++) map = withProgress(map, `livro-${i}`, i);
      const keys = Object.keys(map);
      expect(keys).toHaveLength(20);
      expect(keys[0]).toBe('livro-5');
      expect(keys.at(-1)).toBe('livro-24');
    });

    it('não altera o objeto original', () => {
      const original = { a: 1 };
      withProgress(original, 'b', 2);
      expect(original).toEqual({ a: 1 });
    });
  });

  it('opções do cookie: httpOnly, Lax, path /, 1 ano; Secure só em produção', () => {
    const prod = progressCookieOptions(true);
    expect(prod).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 31_536_000,
    });
    expect(progressCookieOptions(false).secure).toBe(false);
    expect(progressCookieOptions(false).httpOnly).toBe(true);
  });
});

describe('parâmetros de URL', () => {
  const known = ['o-livro-de-azrael', 'sal-e-cinza'];

  it('?livro= aceita só slug no formato certo e conhecido', () => {
    expect(parseBookParam('sal-e-cinza', known)).toBe('sal-e-cinza');
    expect(parseBookParam(['sal-e-cinza', 'x'], known)).toBe('sal-e-cinza');
    expect(parseBookParam('desconhecido', known)).toBeNull();
    expect(parseBookParam('Sal E Cinza', known)).toBeNull();
    expect(parseBookParam('../../etc', known)).toBeNull();
    expect(parseBookParam("x' or 1=1 --", known)).toBeNull();
    expect(parseBookParam('', known)).toBeNull();
    expect(parseBookParam(undefined, known)).toBeNull();
  });

  it('?aba= cai em "lidos" para qualquer coisa que não seja "fila"', () => {
    expect(parseShelfTab('fila')).toBe('fila');
    expect(parseShelfTab('lidos')).toBe('lidos');
    expect(parseShelfTab('<script>')).toBe('lidos');
    expect(parseShelfTab(undefined)).toBe('lidos');
  });

  it.each([
    ['1', 1],
    ['12', 12],
    ['0', null],
    ['01', null],
    ['-1', null],
    ['1.5', null],
    ['abc', null],
    ['', null],
    ['1234567', null],
  ])('número de sessão %j → %j', (text, expected) => {
    expect(parseSessionNumber(text)).toBe(expected);
  });
});

describe('planProgressMigration', () => {
  const books = [
    { id: 'b1', slug: 'o-livro-de-azrael', totalChapters: 52 },
    { id: 'b2', slug: 'sal-e-cinza', totalChapters: 36 },
    { id: 'b3', slug: 'curto', totalChapters: 5 },
  ];

  it('uma linha por livro conhecido, dentro do total', () => {
    expect(
      planProgressMigration({ 'o-livro-de-azrael': 12, 'sal-e-cinza': 0, curto: 5 }, books),
    ).toEqual([
      { book_id: 'b1', chapter: 12 },
      { book_id: 'b2', chapter: 0 },
      { book_id: 'b3', chapter: 5 },
    ]);
  });

  it('ignora livro desconhecido e capítulo acima do total do livro', () => {
    expect(planProgressMigration({ fantasma: 3, curto: 6, 'sal-e-cinza': 10 }, books)).toEqual([
      { book_id: 'b2', chapter: 10 },
    ]);
  });

  it('cookie vazio: nada a migrar', () => {
    expect(planProgressMigration({}, books)).toEqual([]);
  });

  it('um slug como "constructor" não herda do protótipo', () => {
    expect(planProgressMigration({}, [{ id: 'x', slug: 'constructor', totalChapters: 9 }])).toEqual(
      [],
    );
  });
});
