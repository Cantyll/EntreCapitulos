import type { Route } from 'next';

import type { IconName } from '@/components/ui/Icon';

import { hasRole, type Role, type RoleRequirement } from './auth/roles';
import { comingSoonPages } from './coming-soon';
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
export function getPublicNav({
  currentBookSlug,
}: {
  /** `null` quando não há livro em leitura: "Lendo agora" aponta para /livro, que leva à estante. */
  currentBookSlug: string | null;
}): PublicNavItem[] {
  const currentBookHref = currentBookSlug ? bookHref(currentBookSlug) : ('/livro' as Route);

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
  /** Quem pode abrir: só a administradora ('admin') ou também a moderadora ('staff'). */
  access: RoleRequirement;
  /** Mostra o contador de comentários esperando aprovação. */
  pendingBadge?: boolean;
};

/**
 * Menu do painel: só áreas que existem. Membros, Votações e Configurações ficam fora até serem
 * construídas (ver `comingSoonPages`). A ordem aqui é a ordem da barra lateral.
 */
export const adminNav: readonly AdminNavItem[] = [
  {
    label: 'Visão geral',
    href: '/painel',
    icon: 'home',
    access: 'admin',
    match: 'exact',
    placement: 'tab',
  },
  {
    label: 'Sessões',
    href: '/painel/sessoes',
    icon: 'list',
    access: 'admin',
    match: 'prefix',
    placement: 'tab',
  },
  {
    label: 'Livros',
    href: '/painel/livros',
    icon: 'book',
    access: 'admin',
    match: 'prefix',
    placement: 'more',
  },
  {
    label: 'Comentários',
    href: '/painel/comentarios',
    icon: 'chat',
    access: 'staff',
    match: 'prefix',
    placement: 'tab',
    pendingBadge: true,
  },
];

/** Só os itens que o papel pode abrir: a moderadora vê apenas Comentários. */
export function getAdminNavFor(role: Role): AdminNavItem[] {
  return adminNav.filter((item) => hasRole(role, item.access));
}

export function isAdminNavActive(item: AdminNavItem, pathname: string) {
  if (item.match === 'exact') return pathname === item.href;
  return inSegment(pathname, item.href);
}

/**
 * Barra inferior do celular: duas abas, o botão central "Nova sessão", as demais abas e "Mais".
 * `left` e `right` ficam de cada lado do botão central; `more` vai para dentro da folha "Mais".
 */
export function getAdminTabbar(role: Role) {
  const items = getAdminNavFor(role);
  const tabs = items.filter((item) => item.placement === 'tab');
  return {
    left: tabs.slice(0, 2),
    right: tabs.slice(2),
    more: items.filter((item) => item.placement === 'more'),
    canCreateSession: hasRole(role, 'admin'),
  };
}

/** Título do topo do painel. */
export function getAdminTitle(pathname: string) {
  if (pathname === NEW_SESSION_HREF) return 'Nova sessão';
  if (/^\/painel\/sessoes\/[^/]+$/.test(pathname)) return 'Editar sessão';
  const match = adminNav
    .filter((item) => isAdminNavActive(item, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.label;
  const soon = Object.values(comingSoonPages).find((page) => inSegment(pathname, page.href));
  return soon?.title ?? 'Painel';
}
