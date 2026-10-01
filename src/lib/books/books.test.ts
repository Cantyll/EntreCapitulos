import { describe, expect, it } from 'vitest';

import { BOOK_MESSAGES, bookErrorMessage, classifyBookError } from './errors';
import { slugify, uniqueSlug } from './slug';
import {
  checkChapters,
  createBookSchema,
  fieldErrors,
  numberField,
  parseGenres,
  ratingSchema,
  totalChaptersSchema,
} from './validation';

describe('slugify', () => {
  it.each([
    ['O Livro de Azrael', 'o-livro-de-azrael'],
    ['  Cem Anos de Solidão  ', 'cem-anos-de-solidao'],
    ['Ação & Reação: o retorno!', 'acao-reacao-o-retorno'],
    ['Ñandú — À Beira-Mar', 'nandu-a-beira-mar'],
    ['Livro 2: A Missão (parte 1)', 'livro-2-a-missao-parte-1'],
    ['---', 'livro'],
    ['', 'livro'],
    ['日本語', 'livro'],
  ])('%j → %s', (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  it('respeita o limite do banco e o formato', () => {
    const slug = slugify('a '.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('uniqueSlug', () => {
  it('acrescenta -2, -3 quando colide', () => {
    expect(uniqueSlug('livro', new Set())).toBe('livro');
    expect(uniqueSlug('livro', new Set(['livro']))).toBe('livro-2');
    expect(uniqueSlug('livro', new Set(['livro', 'livro-2', 'livro-3']))).toBe('livro-4');
  });
});

describe('validação de capítulos', () => {
  it('o total não pode ficar abaixo do capítulo atual', () => {
    expect(checkChapters(10, 52)).toBeNull();
    expect(checkChapters(52, 52)).toBeNull();
    expect(checkChapters(0, 1)).toBeNull();
    expect(checkChapters(53, 52)).toMatch(/abaixo do capítulo atual/);
  });

  it.each([0, -1, 1.5, 1001, Number.NaN])('total inválido %s', (n) => {
    expect(totalChaptersSchema.safeParse(n).success).toBe(false);
  });
  it.each([1, 52, 1000])('total válido %s', (n) => {
    expect(totalChaptersSchema.safeParse(n).success).toBe(true);
  });
});

describe('nota', () => {
  it.each([0, 0.5, 4, 4.5, 5])('aceita %s', (n) => {
    expect(ratingSchema.safeParse(n).success).toBe(true);
  });
  it.each([-0.5, 5.5, 4.3, 0.25, Number.NaN, Infinity])('recusa %s', (n) => {
    expect(ratingSchema.safeParse(n).success).toBe(false);
  });
});

describe('gêneros', () => {
  it('separa por vírgula, limpa e tira repetidos', () => {
    expect(parseGenres(' Fantasia ,romance,, FANTASIA , Dark  Romance ')).toEqual([
      'Fantasia',
      'romance',
      'Dark Romance',
    ]);
    expect(parseGenres(['a', ' a ', 'b'])).toEqual(['a', 'b']);
    expect(parseGenres('')).toEqual([]);
  });
});

describe('numberField', () => {
  it('vazio e lixo viram NaN', () => {
    expect(numberField('12')).toBe(12);
    expect(numberField('4,5')).toBe(4.5);
    expect(Number.isNaN(numberField(''))).toBe(true);
    expect(Number.isNaN(numberField(null))).toBe(true);
    expect(Number.isNaN(numberField('abc'))).toBe(true);
  });
});

describe('createBookSchema', () => {
  const base = {
    title: ' O Livro ',
    author: 'Alguém',
    synopsis: '  ',
    genres: ['Fantasia'],
    total_chapters: 52,
    status: 'queued' as const,
    rating: null,
    finished_at: null,
  };

  it('limpa os textos e transforma sinopse vazia em null', () => {
    const parsed = createBookSchema.parse(base);
    expect(parsed.title).toBe('O Livro');
    expect(parsed.synopsis).toBeNull();
  });

  it('título e autor são obrigatórios, em pt-BR', () => {
    const result = createBookSchema.safeParse({ ...base, title: '  ', author: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors.title).toBe('Preencha o título.');
      expect(errors.author).toBe('Preencha o autor.');
    }
  });

  it('livro terminado exige nota e data válidas', () => {
    const missing = createBookSchema.safeParse({ ...base, status: 'finished' });
    expect(missing.success).toBe(false);
    if (!missing.success)
      expect(Object.keys(fieldErrors(missing.error))).toEqual(
        expect.arrayContaining(['rating', 'finished_at']),
      );

    expect(
      createBookSchema.safeParse({
        ...base,
        status: 'finished',
        rating: 4.5,
        finished_at: '2026-03-10',
      }).success,
    ).toBe(true);
    expect(
      createBookSchema.safeParse({
        ...base,
        status: 'finished',
        rating: 4.3,
        finished_at: '2026-03-10',
      }).success,
    ).toBe(false);
    expect(
      createBookSchema.safeParse({
        ...base,
        status: 'finished',
        rating: 4,
        finished_at: '2026-02-31',
      }).success,
    ).toBe(false);
  });

  it('estado desconhecido é recusado', () => {
    expect(createBookSchema.safeParse({ ...base, status: 'archived' }).success).toBe(false);
  });
});

describe('mensagens de erro do banco', () => {
  it.each([
    [
      {
        code: 'P0001',
        message: 'book_already_reading: finish the book being read before starting another',
      },
      'book_already_reading',
    ],
    [
      { code: 'P0001', message: 'book_not_queued: only a book in the queue can be started' },
      'book_not_queued',
    ],
    [
      { code: 'P0001', message: 'book_not_reading: only the book being read can be finished' },
      'book_not_reading',
    ],
    [
      { code: '23514', message: 'invalid_rating: the rating is between 0 and 5, in half steps' },
      'invalid_rating',
    ],
    [
      {
        code: '42501',
        message: 'not_admin: only the administrator can change the book being read',
      },
      'not_admin',
    ],
    [
      {
        code: '23505',
        message: 'duplicate key value violates unique constraint "books_single_reading"',
      },
      'book_already_reading',
    ],
    [
      { code: '23505', message: 'duplicate key value violates unique constraint "books_slug_key"' },
      'slug_taken',
    ],
    [
      {
        code: '23514',
        message:
          'new row for relation "books" violates check constraint "books_current_chapter_range"',
      },
      'chapters',
    ],
    [
      {
        code: '23503',
        message: 'update or delete on table "books" violates foreign key constraint',
      },
      'has_sessions',
    ],
    [
      { code: 'PGRST202', message: 'Could not find the function public.start_book' },
      'migration_pending',
    ],
    [
      { code: '42883', message: 'function public.start_book(uuid) does not exist' },
      'migration_pending',
    ],
    [{ code: 'XX000', message: 'algo novo' }, 'generic'],
    [null, 'generic'],
    [undefined, 'generic'],
  ])('%j → %s', (error, key) => {
    expect(classifyBookError(error)).toBe(key);
    expect(bookErrorMessage(error)).toBe(BOOK_MESSAGES[key as keyof typeof BOOK_MESSAGES]);
  });

  it('a mensagem mostrada nunca repete o texto técnico do banco', () => {
    const shown = bookErrorMessage({
      code: '23505',
      message: 'duplicate key value violates unique constraint "books_slug_key"',
    });
    expect(shown).not.toMatch(/constraint|duplicate|books_/);
  });
});
