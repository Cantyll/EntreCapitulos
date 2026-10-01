import type { Route } from 'next';

/*
 * URLs dinâmicas do site num lugar só. Os tipos gerados pelo Next (typedRoutes) só reconhecem
 * como `Route` as rotas estáticas; as dinâmicas são montadas aqui e a checagem no fim do arquivo
 * falha a compilação se a pasta de uma delas for renomeada.
 */

export function bookHref(slug: string): Route {
  return `/livros/${slug}` as Route;
}

/** Painel: lista de livros, formulário de novo livro e edição. */
export const ADMIN_BOOKS_HREF: Route = '/painel/livros';
export const ADMIN_NEW_BOOK_HREF: Route = '/painel/livros/novo';

export function adminBookHref(id: string): Route {
  return `/painel/livros/${id}` as Route;
}

/** Painel: lista de sessões, nova sessão e o editor. */
export const ADMIN_SESSIONS_HREF: Route = '/painel/sessoes';
export const ADMIN_NEW_SESSION_HREF: Route = '/painel/sessoes/nova';

export function adminSessionHref(id: string): Route {
  return `/painel/sessoes/${id}` as Route;
}

/** Avisos que a lista de sessões mostra depois de uma ação (só estes valores são aceitos). */
export const SESSION_NOTICES = ['publicada', 'rascunho', 'excluida'] as const;
export type SessionNotice = (typeof SESSION_NOTICES)[number];

export function adminSessionsNoticeHref(notice: SessionNotice, number?: number): Route {
  const query = number ? `?aviso=${notice}&n=${number}` : `?aviso=${notice}`;
  return `/painel/sessoes${query}` as Route;
}

/** A numeração das sessões reinicia a cada livro, por isso o livro faz parte da URL. */
export function sessionHref(bookSlug: string, number: number | string): Route {
  return `/livros/${bookSlug}/sessoes/${number}` as Route;
}

type Expect<T extends true> = T;

export type DynamicRoutesExist = [
  Expect<'/livros/x' extends Route<'/livros/x'> ? true : false>,
  Expect<'/livros/x/sessoes/1' extends Route<'/livros/x/sessoes/1'> ? true : false>,
  Expect<'/painel/livros/x' extends Route<'/painel/livros/x'> ? true : false>,
  Expect<'/painel/sessoes/x' extends Route<'/painel/sessoes/x'> ? true : false>,
];
