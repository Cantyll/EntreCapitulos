import { describe, expect, it } from 'vitest';

import { postSignInPath, safeNext, signInPath } from './safe-next';

describe('safeNext', () => {
  it.each([
    ['/', '/'],
    ['/painel', '/painel'],
    ['/painel/comentarios', '/painel/comentarios'],
    ['/livros/o-livro-de-azrael/sessoes/4', '/livros/o-livro-de-azrael/sessoes/4'],
    ['/sessoes?pagina=2', '/sessoes?pagina=2'],
    ['/livros/x#capitulo-10', '/livros/x#capitulo-10'],
    ['/livros/%C3%A1', '/livros/%C3%A1'],
    ['/sessoes?volta=%2Fpainel', '/sessoes?volta=%2Fpainel'],
  ])('accepts the internal path %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    42,
    ['/painel'],
    '',
    'painel',
    'https://evil.test',
    'http://evil.test/painel',
    '//evil.test',
    '//evil.test/painel',
    '///evil.test',
    '/\\evil.test',
    '\\\\evil.test',
    '/\\/evil.test',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,oi',
    ' /painel',
    '/pai\nnel',
    '/\t/evil.test',
    '/painel\r\nSet-Cookie: x=1',
    '/%2F%2Fevil.test',
    '/%2fevil.test',
    '/%5Cevil.test',
    '/painel%0d%0aSet-Cookie:x',
    '/entrar',
    '/entrar?next=/painel',
    '/auth/callback?code=x',
    '/boas-vindas',
    '/boas-vindas?next=%2Fpainel',
    `/${'a'.repeat(2048)}`,
  ])('rejects %j', (input) => {
    expect(safeNext(input)).toBe('/');
  });

  it('normalizes dot segments instead of returning the raw input', () => {
    expect(safeNext('/sessoes/../painel')).toBe('/painel');
    expect(safeNext('/./entrar')).toBe('/');
    expect(safeNext('/x/../../entrar')).toBe('/');
  });

  it('does not treat paths that only start like the login pages as loops', () => {
    expect(safeNext('/entrarx')).toBe('/entrarx');
    expect(safeNext('/authors')).toBe('/authors');
  });
});

describe('postSignInPath', () => {
  it('goes to next when the name is confirmed', () => {
    expect(postSignInPath('/painel', true)).toBe('/painel');
  });

  it('goes through /boas-vindas first when it is not', () => {
    expect(postSignInPath('/painel', false)).toBe('/boas-vindas?next=%2Fpainel');
    expect(postSignInPath('https://evil.test', false)).toBe('/boas-vindas?next=%2F');
  });

  it('keeps the /boas-vindas next valid for safeNext', () => {
    const next = new URL(
      postSignInPath('/sessoes?pagina=2', false),
      'http://x.test',
    ).searchParams.get('next');
    expect(safeNext(next)).toBe('/sessoes?pagina=2');
  });
});

describe('signInPath', () => {
  it('carries a valid next', () => {
    expect(signInPath('/painel/livros')).toBe('/entrar?next=%2Fpainel%2Flivros');
  });

  it('drops an unsafe or default next', () => {
    expect(signInPath('/')).toBe('/entrar');
    expect(signInPath('//evil.test')).toBe('/entrar');
  });
});
