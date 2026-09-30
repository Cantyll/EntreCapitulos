import type { Route } from 'next';

import type { IconName } from '@/components/ui/Icon';

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

// ---------- Painel da administradora ----------

export const NEW_SESSION_HREF = '/painel/sessoes/nova' satisfies Route;

export type AdminNavItem = {
  label: string;
  href: Route;
  icon: IconName;
  /** 'exact': só a própria rota. 'prefix': também as filhas (/painel/sessoes/nova fica em Sessões). */
  match: 'exact' | 'prefix';
  /** Na barra inferior do celular: direto na barra ('tab') ou dentro da folha "Mais" ('more'). */
  placement: 'tab' | 'more';
  /** Mostra o contador de comentários esperando aprovação. */
  pendingBadge?: boolean;
};

/** Menu do painel, igual ao do protótipo. A ordem aqui é a ordem da barra lateral. */
export const adminNav: readonly AdminNavItem[] = [
  { label: 'Visão geral', href: '/painel', icon: 'home', match: 'exact', placement: 'tab' },
  { label: 'Sessões', href: '/painel/sessoes', icon: 'list', match: 'prefix', placement: 'tab' },
  { label: 'Livros', href: '/painel/livros', icon: 'book', match: 'prefix', placement: 'more' },
  {
    label: 'Comentários',
    href: '/painel/comentarios',
    icon: 'chat',
    match: 'prefix',
    placement: 'tab',
    pendingBadge: true,
  },
  { label: 'Membros', href: '/painel/membros', icon: 'users', match: 'prefix', placement: 'more' },
  { label: 'Votações', href: '/painel/votacoes', icon: 'vote', match: 'prefix', placement: 'more' },
  {
    label: 'Configurações',
    href: '/painel/configuracoes',
    icon: 'settings',
    match: 'prefix',
    placement: 'more',
  },
];

export function isAdminNavActive(item: AdminNavItem, pathname: string) {
  if (item.match === 'exact') return pathname === item.href;
  return inSegment(pathname, item.href);
}

/**
 * Barra inferior do celular: duas abas, o botão central "Nova sessão", as demais abas e "Mais".
 * `left` e `right` ficam de cada lado do botão central; `more` vai para dentro da folha "Mais".
 */
export function getAdminTabbar() {
  const tabs = adminNav.filter((item) => item.placement === 'tab');
  return {
    left: tabs.slice(0, 2),
    right: tabs.slice(2),
    more: adminNav.filter((item) => item.placement === 'more'),
  };
}

/** Título do topo do painel. */
export function getAdminTitle(pathname: string) {
  if (pathname === NEW_SESSION_HREF) return 'Nova sessão';
  const match = adminNav
    .filter((item) => isAdminNavActive(item, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? 'Painel';
}
