import { isValidBookSlug } from '@/lib/spoiler';

/*
 * Parâmetros de URL das páginas públicas. Tudo que vem da barra de endereço é validado antes de
 * virar consulta: slug só no formato certo, e só um livro que existe de verdade.
 */

type Param = string | string[] | undefined;

const first = (value: Param): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * `?livro=`: o slug pedido, se estiver no formato certo E for um dos livros conhecidos; senão
 * `null` (a página cai no livro padrão, sem erro).
 */
export function parseBookParam(value: Param, knownSlugs: readonly string[]): string | null {
  const slug = first(value);
  if (!isValidBookSlug(slug)) return null;
  return knownSlugs.includes(slug) ? slug : null;
}

export const SHELF_TABS = ['lidos', 'fila'] as const;
export type ShelfTab = (typeof SHELF_TABS)[number];

/** `?aba=` da estante. Qualquer outra coisa vira "lidos". */
export function parseShelfTab(value: Param): ShelfTab {
  const tab = first(value);
  return tab === 'fila' ? 'fila' : 'lidos';
}

/** Número da sessão na URL: inteiro positivo sem zero à esquerda. */
const SESSION_NUMBER = /^[1-9]\d{0,5}$/;

export function parseSessionNumber(value: string): number | null {
  return SESSION_NUMBER.test(value) ? Number(value) : null;
}
