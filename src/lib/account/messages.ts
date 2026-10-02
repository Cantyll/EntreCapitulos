/** Palavra que a pessoa digita para confirmar a exclusão da conta. */
export const DELETE_CONFIRMATION = 'EXCLUIR';

/** A confirmação aceita maiúsculas ou minúsculas e ignora espaços nas pontas. */
export function isDeleteConfirmed(input: unknown): boolean {
  return typeof input === 'string' && input.trim().toUpperCase() === DELETE_CONFIRMATION;
}

type DbErrorLike = { code?: string | null; message?: string | null };

export const ACCOUNT_MESSAGES = {
  confirm: `Para excluir, digite ${DELETE_CONFIRMATION} no campo.`,
  staff:
    'Contas da equipe não podem ser excluídas por aqui. A conta precisa perder o papel de equipe antes.',
  not_signed_in: 'Entre de novo para continuar.',
  unavailable: 'Este recurso ainda não está disponível. Tente de novo mais tarde.',
  generic: 'Não foi possível excluir agora. Tente de novo em instantes.',
} as const;

export type AccountMessageKey = keyof typeof ACCOUNT_MESSAGES;

/** `PGRST202`: a função ainda não existe no banco (migration não aplicada). */
export function classifyDeleteAccountError(
  error: DbErrorLike | null | undefined,
): AccountMessageKey {
  if (!error) return 'generic';
  if ((error.message ?? '').startsWith('staff_cannot_delete:')) return 'staff';
  if (error.code === 'PGRST202' || error.code === '42883') return 'unavailable';
  if (error.code === '42501') return 'not_signed_in';
  return 'generic';
}
