/*
 * Erros do banco na gestão de membros (etapa 8f), em pt-BR. As funções do banco levantam `codigo: texto`; o
 * app mapeia SEMPRE pelo prefixo da mensagem e só depois pelo código, porque `not_admin:` e um `permission
 * denied` cru compartilham o `42501`. Só lê `code` e o prefixo para classificar: a mensagem nunca vai para a
 * tela nem para o log (o log usa `logFailure`, que só imprime nome e códigos).
 */
type DbErrorLike = { code?: string | null; message?: string | null };

/** Os prefixos que as funções da migration `member_management` usam. */
export const MEMBER_ERROR_PREFIXES = [
  'not_admin',
  'unsupported_isolation',
  'invalid_role',
  'invalid_input',
  'target_not_found',
  'last_admin',
  'self_change',
  'role_conflict',
  'member_suspended',
  'target_anonymous',
  'staff_target',
  'staff_cannot_delete',
  'contact_unavailable',
  'too_many',
] as const;

export const MEMBER_MESSAGES = {
  not_admin: 'Só a administração pode fazer isso. O seu cargo pode ter mudado: atualize a página.',
  invalid_role: 'Escolha um cargo válido: Administração, Moderação ou Membro.',
  invalid_input: 'Pedido inválido. Atualize a página e tente de novo.',
  invalid_id: 'Pessoa inválida. Volte para a lista e escolha de novo.',
  target_not_found:
    'Esta pessoa não existe mais (a conta pode ter sido excluída). Volte para a lista.',
  last_admin:
    'Esta é a última conta de Administração: o cargo não pode ser retirado. Dê o cargo a outra pessoa antes.',
  self_change:
    'Esta ação não vale para a sua própria conta. Para o seu nome, os seus dados ou a sua exclusão, use "Minha conta".',
  role_conflict:
    'O cargo desta pessoa mudou desde que você abriu a página (outra pessoa da administração pode ter alterado). Atualize a página e confira antes de tentar de novo.',
  member_suspended:
    'Esta pessoa está com os comentários suspensos. Reative os comentários antes de dar um cargo de equipe.',
  target_anonymous: 'Uma conta anônima (login sem e-mail) não pode ter cargo de equipe.',
  staff_target:
    'Quem tem cargo de equipe não tem os comentários suspensos. Mude o cargo para Membro antes.',
  staff_cannot_delete:
    'Esta conta tem cargo de equipe. Mude o cargo para Membro antes de excluir a conta.',
  contact_unavailable:
    'O banco não consegue ler os dados da conta (e-mail e último acesso) neste momento. O resto da página continua funcionando e nada foi registrado na auditoria.',
  unavailable: 'Falta aplicar a atualização do banco (Database deploy).',
  retry: 'O banco estava ocupado e nada foi alterado. Tente de novo em instantes.',
  permission: 'O banco recusou a permissão para esta ação. Entre de novo e tente outra vez.',
  confirm_name:
    'Para dar o cargo de Administração, digite o nome da pessoa, exatamente como aparece na página.',
  confirm_delete: 'Para excluir, digite EXCLUIR no campo.',
  empty_search: 'Digite um nome ou um e-mail para buscar.',
  email_not_found: 'Nenhuma pessoa com esse e-mail.',
  generic: 'Não foi possível concluir agora. Tente de novo em instantes.',
} as const;

export type MemberErrorKey = keyof typeof MEMBER_MESSAGES;

const PREFIX_TO_KEY = {
  not_admin: 'not_admin',
  // Erros de programação ou de ambiente (nunca devem chegar a quem usa a tela): mensagem genérica e log.
  unsupported_isolation: 'generic',
  invalid_role: 'invalid_role',
  invalid_input: 'invalid_input',
  target_not_found: 'target_not_found',
  last_admin: 'last_admin',
  self_change: 'self_change',
  role_conflict: 'role_conflict',
  member_suspended: 'member_suspended',
  target_anonymous: 'target_anonymous',
  staff_target: 'staff_target',
  staff_cannot_delete: 'staff_cannot_delete',
  contact_unavailable: 'contact_unavailable',
  too_many: 'generic',
} as const satisfies Record<(typeof MEMBER_ERROR_PREFIXES)[number], MemberErrorKey>;

/**
 * Função ou tabela inexistente: a migration ainda não foi aplicada. `PGRST202` (função fora do cache do
 * PostgREST), `42883` (função inexistente), `42P01` (tabela inexistente), `PGRST205` (tabela fora do cache) e
 * `PGRST200` (relação fora do cache).
 */
const UNAVAILABLE_CODES = ['PGRST202', '42883', '42P01', 'PGRST205', 'PGRST200'];

/**
 * `40P01` (deadlock com uma moderação ou exclusão do mesmo comentário), `55P03` (a trava não saiu a tempo) e
 * `57014` (o papel `authenticated` tem `statement_timeout` de 8 s): a transação inteira, auditoria incluída,
 * voltou. É seguro tentar de novo.
 */
const RETRY_CODES = ['40P01', '55P03', '57014'];

export function classifyMemberError(error: DbErrorLike | null | undefined): MemberErrorKey {
  if (!error) return 'generic';
  const message = error.message ?? '';
  for (const prefix of MEMBER_ERROR_PREFIXES) {
    if (message.startsWith(`${prefix}:`)) return PREFIX_TO_KEY[prefix];
  }
  const code = error.code ?? '';
  if (UNAVAILABLE_CODES.includes(code)) return 'unavailable';
  if (RETRY_CODES.includes(code)) return 'retry';
  // Um 42501 SEM prefixo conhecido não é "só a administração": é permissão do banco ou sessão.
  if (code === '42501') return 'permission';
  return 'generic';
}

/** Vale registrar (com `logFailure`) o erro que virou uma destas mensagens: são inesperados, não recusas de regra. */
export function isUnexpectedMemberError(key: MemberErrorKey): boolean {
  return key === 'generic' || key === 'permission' || key === 'retry';
}
