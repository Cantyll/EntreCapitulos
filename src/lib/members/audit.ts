/*
 * Linhas da auditoria (`member_audit`) para a tela do perfil. Puro: recebe as linhas como o banco as devolve
 * e o nome de quem agiu (ou `null` quando a conta dele já não existe). `details` só tem conteúdo em
 * `role_change` (`{from, to}`, garantido por um CHECK do banco) e aqui é validado de novo.
 */
import { ROLE_LABELS, parseRole, type Role } from '@/lib/auth/roles';

export const AUDIT_ACTIONS = [
  'role_change',
  'suspend',
  'unsuspend',
  'delete_account',
  'view_contact',
  'export_data',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditRow = {
  id: string;
  actor_id: string;
  action: string;
  details: unknown;
  created_at: string;
};

export type AuditEntry = {
  id: string;
  action: AuditAction | 'unknown';
  createdAt: string;
  actorId: string;
  /** `null`: a conta de quem agiu já foi excluída. */
  actorName: string | null;
  /** Só em `role_change`. */
  roleChange: { from: Role; to: Role } | null;
};

const ROLE_VALUES: readonly string[] = ['admin', 'moderator', 'member'];

function readRoleChange(details: unknown): { from: Role; to: Role } | null {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return null;
  const { from, to } = details as Record<string, unknown>;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (!ROLE_VALUES.includes(from) || !ROLE_VALUES.includes(to)) return null;
  return { from: parseRole(from), to: parseRole(to) };
}

export function toAuditEntries(
  rows: readonly AuditRow[],
  actorNames: ReadonlyMap<string, string>,
): AuditEntry[] {
  return rows.map((row) => {
    const action = (AUDIT_ACTIONS as readonly string[]).includes(row.action)
      ? (row.action as AuditAction)
      : 'unknown';
    return {
      id: row.id,
      action,
      createdAt: row.created_at,
      actorId: row.actor_id,
      actorName: actorNames.get(row.actor_id) ?? null,
      roleChange: action === 'role_change' ? readRoleChange(row.details) : null,
    };
  });
}

/** O que a linha diz, em pt-BR. Nunca inclui dado pessoal: só cargos e o tipo da ação. */
export function describeAuditEntry(entry: AuditEntry): string {
  switch (entry.action) {
    case 'role_change':
      return entry.roleChange
        ? `Cargo alterado: ${ROLE_LABELS[entry.roleChange.from]} → ${ROLE_LABELS[entry.roleChange.to]}`
        : 'Cargo alterado';
    case 'suspend':
      return 'Comentários suspensos';
    case 'unsuspend':
      return 'Comentários reativados';
    case 'delete_account':
      return 'Conta excluída';
    case 'view_contact':
      return 'E-mail e último acesso consultados';
    case 'export_data':
      return 'Dados da pessoa baixados';
    default:
      return 'Ação registrada';
  }
}

export const DELETED_ACCOUNT_LABEL = 'Conta excluída';
