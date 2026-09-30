import { describe, expect, it } from 'vitest';

import { normalizeDisplayName, suggestedDisplayName } from './display-name';

describe('normalizeDisplayName', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeDisplayName('  Carol   Dias ')).toEqual({ ok: true, value: 'Carol Dias' });
  });

  it('drops control and invisible characters', () => {
    expect(normalizeDisplayName('Ca\u0000rol\u200B\n Dias')).toEqual({
      ok: true,
      value: 'Carol Dias',
    });
  });

  it('rejects an empty name', () => {
    expect(normalizeDisplayName('   ')).toEqual({ ok: false, error: 'empty' });
    expect(normalizeDisplayName(null)).toEqual({ ok: false, error: 'empty' });
    expect(normalizeDisplayName('\u200B')).toEqual({ ok: false, error: 'empty' });
  });

  it('accepts exactly 60 characters and rejects 61, counting like Postgres', () => {
    expect(normalizeDisplayName('a'.repeat(60)).ok).toBe(true);
    expect(normalizeDisplayName('a'.repeat(61))).toEqual({ ok: false, error: 'too_long' });
    expect(normalizeDisplayName('📚'.repeat(60)).ok).toBe(true);
  });

  it('rejects anything that looks like an e-mail', () => {
    expect(normalizeDisplayName('carol@exemplo.com')).toEqual({ ok: false, error: 'email' });
  });

  it('keeps accents', () => {
    expect(normalizeDisplayName('Júlia Prado')).toEqual({ ok: true, value: 'Júlia Prado' });
  });
});

describe('suggestedDisplayName', () => {
  it('suggests the Google name and nothing for the default "Leitor"', () => {
    expect(suggestedDisplayName('Carol Dias')).toBe('Carol Dias');
    expect(suggestedDisplayName('Leitor')).toBe('');
  });
});
