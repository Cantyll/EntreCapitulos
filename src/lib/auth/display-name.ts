/** Regras do nome público (comentários). Mesmo limite do banco: 1 a 60 caracteres. */

export const DISPLAY_NAME_MAX = 60;

/** Nome que o banco dá a quem se cadastrou sem nome. */
export const DEFAULT_DISPLAY_NAME = 'Leitor';

export type DisplayNameResult =
  { ok: true; value: string } | { ok: false; error: 'empty' | 'too_long' | 'email' };

export function normalizeDisplayName(input: unknown): DisplayNameResult {
  const value = (typeof input === 'string' ? input : '')
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');

  if (value.length === 0) return { ok: false, error: 'empty' };
  // Conta caracteres como o char_length do Postgres (pontos de código), não unidades UTF-16.
  if ([...value].length > DISPLAY_NAME_MAX) return { ok: false, error: 'too_long' };
  // O nome é público: nada que pareça e-mail.
  if (value.includes('@')) return { ok: false, error: 'email' };
  return { ok: true, value };
}

export const DISPLAY_NAME_ERRORS: Record<
  Exclude<DisplayNameResult, { ok: true }>['error'],
  string
> = {
  empty: 'Escreva como você quer aparecer.',
  too_long: `Use no máximo ${DISPLAY_NAME_MAX} caracteres.`,
  email: 'Não use o seu e-mail: o nome aparece para todo mundo.',
};

/** Sugestão para o campo: o nome atual, a não ser que seja o padrão "Leitor". */
export function suggestedDisplayName(current: string): string {
  return current === DEFAULT_DISPLAY_NAME ? '' : current;
}
