import { describe, expect, it } from 'vitest';

import { DISPLAY_NAME_MAX, normalizeDisplayName } from './display-name';

describe('normalizeDisplayName', () => {
  it('apara e junta espaços', () => {
    expect(normalizeDisplayName('  Carol   Dias ')).toEqual({ ok: true, value: 'Carol Dias' });
  });

  it('recusa vazio e texto que não é string', () => {
    expect(normalizeDisplayName('   ')).toEqual({ ok: false, error: 'empty' });
    expect(normalizeDisplayName(null)).toEqual({ ok: false, error: 'empty' });
  });

  it('respeita o limite do banco', () => {
    expect(normalizeDisplayName('a'.repeat(DISPLAY_NAME_MAX)).ok).toBe(true);
    expect(normalizeDisplayName('a'.repeat(DISPLAY_NAME_MAX + 1))).toEqual({
      ok: false,
      error: 'too_long',
    });
  });

  it('recusa nome que parece e-mail', () => {
    expect(normalizeDisplayName('carol@exemplo.com')).toEqual({
      ok: false,
      error: 'looks_like_email',
    });
  });
});
