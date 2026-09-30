import { describe, expect, it } from 'vitest';

import { postLoginDestination, safeNext, signInPath } from './safe-next';

describe('safeNext', () => {
  it('aceita caminhos internos e preserva busca e âncora', () => {
    expect(safeNext('/painel')).toBe('/painel');
    expect(safeNext('/painel/comentarios?aba=pendentes')).toBe('/painel/comentarios?aba=pendentes');
    expect(safeNext('/livros/azrael/sessoes/2#capitulo-10')).toBe(
      '/livros/azrael/sessoes/2#capitulo-10',
    );
  });

  it.each([
    ['URL completa', 'https://evil.example/painel'],
    ['sem esquema', '//evil.example'],
    ['barra invertida', '/\\evil.example'],
    ['barra invertida no início', '\\/evil.example'],
    ['esquema javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,x'],
    ['relativo sem barra', 'painel'],
    ['tab escondida', '/\t/evil.example'],
    ['quebra de linha', '/\n/evil.example'],
    ['barra codificada', '/%2F/evil.example'],
    ['barra invertida codificada', '/%5Cevil.example'],
    ['codificação quebrada', '/%E0%A4%A'],
    ['vazio', ''],
    ['muito longo', `/${'a'.repeat(3000)}`],
  ])('rejeita %s', (_name, value) => {
    expect(safeNext(value)).toBe('/');
  });

  it.each([undefined, null, 42, {}, ['/painel']])('rejeita valor que não é texto (%j)', (value) => {
    expect(safeNext(value)).toBe('/');
  });

  it('não volta para as rotas de login (evita laço)', () => {
    expect(safeNext('/entrar')).toBe('/');
    expect(safeNext('/entrar?next=/painel')).toBe('/');
    expect(safeNext('/ENTRAR')).toBe('/');
    expect(safeNext('/auth/callback')).toBe('/');
    expect(safeNext('/boas-vindas')).toBe('/');
    expect(safeNext('/entrarx')).toBe('/entrarx');
  });
});

describe('postLoginDestination', () => {
  it('vai direto ao destino quando o nome já foi confirmado', () => {
    expect(postLoginDestination('/painel', true)).toBe('/painel');
    expect(postLoginDestination('//evil.example', true)).toBe('/');
  });

  it('passa por /boas-vindas quando o nome não foi confirmado', () => {
    expect(postLoginDestination('/painel?a=1', false)).toBe('/boas-vindas?next=%2Fpainel%3Fa%3D1');
    expect(postLoginDestination(undefined, false)).toBe('/boas-vindas');
    expect(postLoginDestination('https://evil.example', false)).toBe('/boas-vindas');
  });
});

describe('signInPath', () => {
  it('monta o login com o next validado', () => {
    expect(signInPath('/painel/livros')).toBe('/entrar?next=%2Fpainel%2Flivros');
    expect(signInPath('https://evil.example')).toBe('/entrar');
  });
});
