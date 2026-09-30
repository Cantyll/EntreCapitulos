export const DISPLAY_NAME_MAX = 60;

export type DisplayNameResult =
  { ok: true; value: string } | { ok: false; error: 'empty' | 'too_long' | 'looks_like_email' };

/** O nome é público: aparece para qualquer visitante, então não aceitamos algo que pareça e-mail. */
export function normalizeDisplayName(input: unknown): DisplayNameResult {
  const value = typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : '';
  if (value.length === 0) return { ok: false, error: 'empty' };
  if (value.length > DISPLAY_NAME_MAX) return { ok: false, error: 'too_long' };
  if (value.includes('@')) return { ok: false, error: 'looks_like_email' };
  return { ok: true, value };
}
