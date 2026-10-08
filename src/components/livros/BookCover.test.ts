import { describe, expect, it } from 'vitest';

import { coverTitleScale } from './BookCover';

describe('coverTitleScale', () => {
  it('mantém o tamanho pedido até 36 caracteres', () => {
    expect(coverTitleScale('O Livro de Azrael')).toBe(1);
    expect(coverTitleScale('x'.repeat(36))).toBe(1);
  });

  it('encolhe títulos longos, sem passar de 60%', () => {
    expect(coverTitleScale('x'.repeat(64))).toBe(0.75);
    expect(coverTitleScale('x'.repeat(100))).toBe(0.6);
    expect(coverTitleScale('x'.repeat(200))).toBe(0.6);
  });

  it('conta emoji e acentos como um caractere e ignora espaços nas pontas', () => {
    expect(coverTitleScale(`  ${'é'.repeat(36)}  `)).toBe(1);
    expect(coverTitleScale('📚'.repeat(36))).toBe(1);
  });
});
