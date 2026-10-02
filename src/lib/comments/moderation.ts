/*
 * Regras puras da moderação: abas, página e a revalidação do "Aprovar os sem alerta".
 */

import { COMMENTS_PAGE_SIZE, isUuid } from './rules';

export const MODERATION_TABS = ['pendentes', 'aprovados', 'removidos'] as const;
export type ModerationTab = (typeof MODERATION_TABS)[number];

/** Estado do comentário que cada aba mostra. */
export const TAB_STATUS = {
  pendentes: 'pending',
  aprovados: 'approved',
  removidos: 'removed',
} as const satisfies Record<ModerationTab, string>;

export function parseModerationTab(raw: unknown): ModerationTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return MODERATION_TABS.find((tab) => tab === value) ?? 'pendentes';
}

/** Página 1, 2, 3…; qualquer coisa fora de um inteiro positivo razoável vira 1. */
export function parsePageNumber(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 ? page : 1;
}

export function pageRange(page: number): { from: number; to: number } {
  const from = (page - 1) * COMMENTS_PAGE_SIZE;
  return { from, to: from + COMMENTS_PAGE_SIZE - 1 };
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / COMMENTS_PAGE_SIZE));
}

/** Os ids que o cliente diz estar vendo: uuids válidos, sem repetição, no máximo uma página. */
export function parseVisibleIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  for (const value of raw) {
    if (isUuid(value)) ids.add(value.toLowerCase());
    if (ids.size >= COMMENTS_PAGE_SIZE) break;
  }
  return [...ids];
}

export type PendingCheck = { id: string; status: string; hasFlag: boolean };

/**
 * "Aprovar os sem alerta": dos ids que o cliente mandou, só os que o SERVIDOR confirma agora como ainda
 * pendentes e sem flag. O resto (já moderado por outra pessoa, com alerta, inexistente) é ignorado.
 */
export function unflaggedPending(
  visibleIds: readonly string[],
  rows: readonly PendingCheck[],
): string[] {
  const byId = new Map(rows.map((row) => [row.id.toLowerCase(), row]));
  return visibleIds.filter((id) => {
    const row = byId.get(id.toLowerCase());
    return row !== undefined && row.status === 'pending' && !row.hasFlag;
  });
}
