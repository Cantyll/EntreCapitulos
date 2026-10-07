/*
 * Erros de `mark_tour_seen` (etapa 8k). Mapeados SEMPRE pelo prefixo da mensagem e só depois pelo código: um
 * `42501` sem prefixo conhecido é problema de permissão, não "você não é da equipe".
 */

export type TourErrorKey =
  | 'not_signed_in'
  | 'not_staff'
  | 'invalid_version'
  | 'profile_not_found'
  | 'unavailable'
  | 'generic';

export const TOUR_MESSAGES: Record<TourErrorKey, string> = {
  not_signed_in: 'Entre na sua conta para guardar o andamento do tutorial.',
  not_staff: 'O tutorial é só para a equipe do painel.',
  invalid_version: 'Não foi possível guardar o andamento do tutorial.',
  profile_not_found: 'Não encontramos o seu perfil. Saia e entre de novo.',
  unavailable: 'Falta aplicar a atualização do banco (Database deploy).',
  generic: 'Não foi possível guardar o andamento do tutorial agora.',
};

const PREFIXES: readonly Exclude<TourErrorKey, 'unavailable' | 'generic'>[] = [
  'not_signed_in',
  'not_staff',
  'invalid_version',
  'profile_not_found',
];

/** Função ou coluna que ainda não existe (antes do Database deploy). */
const UNAVAILABLE_CODES = new Set(['PGRST202', 'PGRST204', 'PGRST205', '42883', '42703', '42P01']);

export function classifyTourError(error: {
  code?: string | null;
  message?: string | null;
}): TourErrorKey {
  const message = typeof error.message === 'string' ? error.message : '';
  for (const key of PREFIXES) {
    if (message.startsWith(`${key}:`)) return key;
  }
  if (error.code && UNAVAILABLE_CODES.has(error.code)) return 'unavailable';
  return 'generic';
}

/** Antes do Database deploy a coluna não existe: a leitura falha em silêncio (sem log). */
export function isTourUnavailable(error: { code?: string | null }): boolean {
  return Boolean(error.code && UNAVAILABLE_CODES.has(error.code));
}
