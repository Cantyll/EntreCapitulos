/*
 * Textos digitados para confirmar uma ação. O servidor confere de novo, sempre.
 */
import { isDeleteConfirmed } from '@/lib/account/messages';

export { isDeleteConfirmed };

/** Nome para comparar: NFC, espaços colapsados, sem espaço nas pontas e sem diferença de maiúsculas. */
export function normalizeTypedName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** O nome digitado confere com o nome de exibição da pessoa? (Para dar o cargo de Administração.) */
export function isNameConfirmed(typed: unknown, actual: string): boolean {
  const wanted = normalizeTypedName(actual);
  return wanted !== '' && normalizeTypedName(typed) === wanted;
}
