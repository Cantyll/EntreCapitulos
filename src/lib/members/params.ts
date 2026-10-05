/*
 * Parâmetros da lista de membros (`?filtro=&pagina=&busca=`), todos validados: qualquer valor fora da lista
 * vira o padrão. A busca por e-mail nunca passa por aqui (ver `search.ts`).
 */
import { parseNameSearch } from './search';

export const MEMBERS_PAGE_SIZE = 25;

export const MEMBER_FILTERS = ['todos', 'equipe', 'suspensos', 'novos'] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];

export const MEMBER_FILTER_LABELS: Record<MemberFilter, string> = {
  todos: 'Todos',
  equipe: 'Equipe',
  suspensos: 'Suspensos',
  novos: 'Novos',
};

/** "Novos": quem entrou nos últimos 7 dias. */
export const NEW_MEMBER_DAYS = 7;

export function parseMemberFilter(raw: unknown): MemberFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return MEMBER_FILTERS.find((filter) => filter === value) ?? 'todos';
}

/** Página 1, 2, 3…; qualquer coisa fora de um inteiro positivo razoável vira 1. */
export function parseMemberPage(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 ? page : 1;
}

export function memberPageRange(page: number): { from: number; to: number } {
  const from = (page - 1) * MEMBERS_PAGE_SIZE;
  return { from, to: from + MEMBERS_PAGE_SIZE - 1 };
}

export function memberPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE));
}

export type MemberListParams = { filter: MemberFilter; page: number; search: string };

export function parseMemberListParams(query: Record<string, unknown>): MemberListParams {
  return {
    filter: parseMemberFilter(query.filtro),
    page: parseMemberPage(query.pagina),
    search: parseNameSearch(query.busca),
  };
}

/** Endereço da lista com os parâmetros (só o que foge do padrão entra na URL). A busca é só por NOME. */
export function memberListHref({ filter, page, search }: Partial<MemberListParams>): string {
  const query = new URLSearchParams();
  if (filter && filter !== 'todos') query.set('filtro', filter);
  if (search) query.set('busca', search);
  if (page && page > 1) query.set('pagina', String(page));
  const text = query.toString();
  return text ? `/painel/membros?${text}` : '/painel/membros';
}

/** Avisos que a lista mostra depois de uma ação (só estes valores são aceitos; nada de texto vindo da URL). */
export const MEMBER_NOTICES = {
  'conta-excluida': { tone: 'ok', message: 'Conta excluída.' },
  'dados-indisponiveis': {
    tone: 'error',
    message:
      'O banco não consegue ler os dados da conta agora, então o arquivo não foi gerado e nada foi registrado na auditoria.',
  },
  'exportacao-falhou': {
    tone: 'error',
    message: 'Não foi possível gerar o arquivo agora. Tente de novo em instantes.',
  },
} as const;

export type MemberNotice = keyof typeof MEMBER_NOTICES;

export function parseMemberNotice(raw: unknown): MemberNotice | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (Object.keys(MEMBER_NOTICES) as MemberNotice[]).find((key) => key === value) ?? null;
}
