import type { Route } from 'next';

/*
 * URLs dinâmicas do site num lugar só. Os tipos gerados pelo Next (typedRoutes) só reconhecem
 * como `Route` as rotas estáticas; as dinâmicas são montadas aqui e a checagem no fim do arquivo
 * falha a compilação se a pasta de uma delas for renomeada.
 */

export function bookHref(slug: string): Route {
  return `/livros/${slug}` as Route;
}

/** A numeração das sessões reinicia a cada livro, por isso o livro faz parte da URL. */
export function sessionHref(bookSlug: string, number: number | string): Route {
  return `/livros/${bookSlug}/sessoes/${number}` as Route;
}

type Expect<T extends true> = T;

export type DynamicRoutesExist = [
  Expect<'/livros/x' extends Route<'/livros/x'> ? true : false>,
  Expect<'/livros/x/sessoes/1' extends Route<'/livros/x/sessoes/1'> ? true : false>,
];
