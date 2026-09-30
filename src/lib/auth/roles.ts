/**
 * Papéis e acesso ao painel. Funções puras: a interface usa para esconder o que a pessoa não
 * abre, e `requireRole()` usa para barrar no servidor. O papel sempre vem do banco (profiles, sob
 * RLS), nunca do JWT nem de metadata. O RLS continua sendo a garantia real.
 */

import type { Route } from 'next';

export const ROLES = ['admin', 'moderator', 'member'] as const;
export type Role = (typeof ROLES)[number];

/** `admin`: só a administradora. `staff`: administradora ou moderadora. */
export type RoleRequirement = 'admin' | 'staff';

/** Valor desconhecido vira `member`, o papel com menos acesso. */
export function parseRole(value: unknown): Role {
  return (ROLES as readonly unknown[]).includes(value) ? (value as Role) : 'member';
}

export function hasRole(role: Role, requirement: RoleRequirement): boolean {
  if (requirement === 'admin') return role === 'admin';
  return role === 'admin' || role === 'moderator';
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administradora',
  moderator: 'Moderadora',
  member: 'Membro',
};

/** Área da moderadora. Todo o resto do painel é só da administradora. */
export const MODERATION_HREF = '/painel/comentarios' satisfies Route;

function inSegment(pathname: string, segment: string) {
  return pathname === segment || pathname.startsWith(`${segment}/`);
}

/** Papel mínimo para abrir uma rota do painel. */
export function panelRequirement(pathname: string): RoleRequirement {
  return inSegment(pathname, MODERATION_HREF) ? 'staff' : 'admin';
}

export function canAccessPanelPath(role: Role, pathname: string): boolean {
  return inSegment(pathname, '/painel') && hasRole(role, panelRequirement(pathname));
}
