import type { Route } from 'next';

import { bookHref } from './routes';

function inSegment(pathname: string, segment: string) {
  return pathname === segment || pathname.startsWith(`${segment}/`);
}

export type PublicNavItem = {
  label: string;
  href: Route;
  isActive: (pathname: string) => boolean;
};

/**
 * Menu do site público, igual ao do protótipo. "Sessões" continua ativo dentro de uma sessão
 * (/livros/[slug]/sessoes/[numero]) e "Lendo agora" aponta para a página do livro atual.
 */
export function getPublicNav({ currentBookSlug }: { currentBookSlug: string }): PublicNavItem[] {
  const currentBookHref = bookHref(currentBookSlug);

  return [
    { label: 'Início', href: '/', isActive: (pathname) => pathname === '/' },
    {
      label: 'Lendo agora',
      href: currentBookHref,
      isActive: (pathname) => pathname === '/livro' || pathname === currentBookHref,
    },
    {
      label: 'Sessões',
      href: '/sessoes',
      isActive: (pathname) =>
        inSegment(pathname, '/sessoes') || /^\/livros\/[^/]+\/sessoes(\/|$)/.test(pathname),
    },
    { label: 'Estante', href: '/estante', isActive: (pathname) => inSegment(pathname, '/estante') },
    {
      label: 'Sobre o clube',
      href: '/sobre',
      isActive: (pathname) => inSegment(pathname, '/sobre'),
    },
  ];
}
