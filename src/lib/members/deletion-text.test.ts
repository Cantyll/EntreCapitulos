import { describe, expect, it } from 'vitest';

import { commentsLine, repliesLine } from './deletion-text';

describe('linhas de contagem do diálogo de exclusão', () => {
  it('um comentário: verbo no singular', () => {
    expect(commentsLine(1)).toBe('1 comentário da pessoa (em todos os estados) será apagado;');
    expect(commentsLine(1)).not.toContain('serão');
  });

  it('vários comentários: plural, com separador de milhar em pt-BR', () => {
    expect(commentsLine(0)).toBe('0 comentários da pessoa (em todos os estados) serão apagados;');
    expect(commentsLine(3)).toContain('3 comentários');
    expect(commentsLine(1234)).toContain('1.234 comentários');
  });

  it('uma resposta some, várias somem', () => {
    expect(repliesLine(1)).toBe('1 resposta de outras pessoas a esses comentários some junto.');
    expect(repliesLine(2)).toBe('2 respostas de outras pessoas a esses comentários somem junto.');
    expect(repliesLine(0)).toContain('0 respostas');
  });

  it('contagem que falhou: a frase diz isso, sem número nem texto quebrado', () => {
    for (const text of [commentsLine(null), repliesLine(null)]) {
      expect(text).toContain('não foi possível contar');
      expect(text).not.toMatch(/\bnull\b|undefined|NaN/);
    }
    expect(commentsLine(null)).toContain('serão apagados');
    expect(repliesLine(null)).toContain('somem junto');
  });
});
