export type Role = 'admin' | 'moderator' | 'member';
export type RoleRequirement = 'admin' | 'staff';

const ROLES: readonly string[] = ['admin', 'moderator', 'member'];

/** O papel vem da coluna `profiles.role`. Qualquer valor desconhecido vale como membro. */
export function parseRole(value: unknown): Role {
  return typeof value === 'string' && ROLES.includes(value) ? (value as Role) : 'member';
}

/** `admin`: só administradora. `staff`: administradora e moderadora. */
export function hasRole(role: Role, requirement: RoleRequirement): boolean {
  if (requirement === 'admin') return role === 'admin';
  return role === 'admin' || role === 'moderator';
}

export function isStaff(role: Role): boolean {
  return hasRole(role, 'staff');
}

/** Primeira página do painel que o papel pode abrir. */
export function panelHomeFor(role: Role): '/painel' | '/painel/comentarios' {
  return role === 'admin' ? '/painel' : '/painel/comentarios';
}
