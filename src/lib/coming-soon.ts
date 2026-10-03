import type { Route } from 'next';

/**
 * Áreas do painel que ainda não existem. Não aparecem no menu (`adminNav`), mas a rota continua
 * atrás de `requireRole('admin')` e mostra "Em breve". Regra: nenhum número, nome ou texto de
 * exemplo; só o que a área será. Quando uma delas ganhar conteúdo de verdade, ela sai desta lista
 * e entra em `adminNav` (lib/navigation.ts).
 */
export const comingSoonPages = {
  membros: {
    href: '/painel/membros' satisfies Route,
    title: 'Membros',
    description: 'A lista de membros, os papéis e o convite de novas pessoas ainda não existem.',
  },
  votacoes: {
    href: '/painel/votacoes' satisfies Route,
    title: 'Votações',
    description: 'A votação do próximo livro ainda não existe.',
  },
  configuracoes: {
    href: '/painel/configuracoes' satisfies Route,
    title: 'Configurações',
    description:
      'As configurações do site, como a identidade e as opções da comunidade, ainda não existem.',
  },
} as const;

export type ComingSoonKey = keyof typeof comingSoonPages;
