import { afterEach, describe, expect, it, vi } from 'vitest';

import { coverUrl, extensionFor, parseCoverPath } from './cover-path';

const ID = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';

describe('parseCoverPath', () => {
  it('aceita books/<uuid>/<nome seguro> com o mesmo uuid', () => {
    expect(parseCoverPath(ID, `books/${ID}/a1b2.png`)).toEqual({
      ok: true,
      folder: `books/${ID}`,
      name: 'a1b2.png',
    });
    expect(parseCoverPath(ID, `books/${ID}/Capa-1_v2.webp`).ok).toBe(true);
  });

  it.each([
    ['../ no meio', `books/${ID}/../x.png`],
    ['../ no começo', `../books/${ID}/x.png`],
    ['uuid diferente', `books/${OTHER}/x.png`],
    ['outro bucket', `avatars/${ID}/x.png`],
    ['raiz diferente', `book/${ID}/x.png`],
    ['sem nome', `books/${ID}/`],
    ['pasta a mais', `books/${ID}/sub/x.png`],
    ['pasta a menos', `books/x.png`],
    ['barra inicial', `/books/${ID}/x.png`],
    ['nome começando com ponto', `books/${ID}/.hidden`],
    ['nome com ..', `books/${ID}/a..b.png`],
    ['nome com espaço', `books/${ID}/a b.png`],
    ['nome com barra invertida', `books/${ID}/a\\b.png`],
    ['nome com %2e%2e', `books/${ID}/%2e%2e`],
    ['nome com nul', `books/${ID}/a\0.png`],
    ['nome longo demais', `books/${ID}/${'a'.repeat(101)}.png`],
  ])('rejeita %s', (_label, path) => {
    expect(parseCoverPath(ID, path).ok).toBe(false);
  });

  it.each([null, undefined, 5, {}, []])('rejeita caminho %j', (path) => {
    expect(parseCoverPath(ID, path).ok).toBe(false);
  });

  it('exige o uuid em minúsculas', () => {
    const upper = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    expect(parseCoverPath(upper, `books/${upper}/x.png`).ok).toBe(false);
    expect(parseCoverPath(upper.toLowerCase(), `books/${upper.toLowerCase()}/x.png`).ok).toBe(true);
  });

  it.each(['x', '', null, undefined, `${ID}/x`, `../${ID}`])('rejeita livro %j', (bookId) => {
    expect(parseCoverPath(bookId, `books/${ID}/x.png`).ok).toBe(false);
  });
});

describe('extensionFor', () => {
  it('só os três tipos aceitos', () => {
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/webp')).toBe('webp');
    expect(extensionFor('image/svg+xml')).toBeNull();
    expect(extensionFor('image/gif')).toBeNull();
    expect(extensionFor('')).toBeNull();
  });
});

describe('coverUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('monta a URL pública do bucket covers', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co/');
    expect(coverUrl(`books/${ID}/x.webp`)).toBe(
      `https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/covers/books/${ID}/x.webp`,
    );
  });

  it('sem capa, sem variável ou com valor inválido: null (a interface usa a capa CSS)', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
    expect(coverUrl(null)).toBeNull();
    expect(coverUrl('')).toBeNull();
    expect(coverUrl('../x')).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(coverUrl(`books/${ID}/x.webp`)).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'não é url');
    expect(coverUrl(`books/${ID}/x.webp`)).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'javascript:alert(1)');
    expect(coverUrl(`books/${ID}/x.webp`)).toBeNull();
  });
});
