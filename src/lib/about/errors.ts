import { ABOUT_ISSUE_MESSAGES } from './schema';

/*
 * Erros do banco da página Sobre, em pt-BR. Mapear SEMPRE pelo prefixo da mensagem (`site_page_conflict:`…), nunca só
 * pelo código: `not_admin:` e um `permission denied` cru compartilham o `42501` (um `42501` sem prefixo conhecido é
 * problema de banco ou de permissão, nunca "só a administração pode"). Só o `code` e o prefixo da `message` são lidos;
 * nada do texto do erro vai para a tela nem para o log (a mensagem do banco pode repetir o conteúdo editado).
 */

type DbErrorLike = { code?: string | null; message?: string | null } | null | undefined;

export const ABOUT_MESSAGES = {
  not_admin: 'Só a administração pode fazer isso.',
  conflict: 'Outra pessoa da administração mudou esta página enquanto você editava.',
  invalid: ABOUT_ISSUE_MESSAGES.invalid,
  too_large: ABOUT_ISSUE_MESSAGES.too_large,
  no_draft: 'Não há rascunho para publicar. Salve o rascunho primeiro.',
  revision_not_found:
    'Essa versão não existe mais (o histórico guarda só as 20 últimas). Atualize a página.',
  busy: 'O banco está ocupado. Tente de novo em instantes.',
  migration_pending: 'Falta aplicar a atualização do banco (Database deploy). Veja o README.',
  generic: 'Não foi possível salvar agora. Tente de novo em instantes.',
} as const;

export type AboutMessageKey = keyof typeof ABOUT_MESSAGES;

const PREFIXES: readonly [string, AboutMessageKey][] = [
  ['not_admin:', 'not_admin'],
  ['site_page_conflict:', 'conflict'],
  ['site_page_invalid:', 'invalid'],
  ['site_page_too_large:', 'too_large'],
  ['site_page_no_draft:', 'no_draft'],
  ['revision_not_found:', 'revision_not_found'],
];

/** Função ou tabela ausente: a migration ainda não foi aplicada (Database deploy). */
const UNAVAILABLE_CODES = ['PGRST202', 'PGRST205', 'PGRST200', '42883', '42P01'];

/** `40P01` (deadlock), `55P03` (trava) e `57014` (tempo esgotado): a transação inteira voltou, sem efeito. */
const BUSY_CODES = ['40P01', '55P03', '57014'];

export function isAboutUnavailable(error: DbErrorLike): boolean {
  return UNAVAILABLE_CODES.includes(error?.code ?? '');
}

export function classifyAboutError(error: DbErrorLike): AboutMessageKey {
  if (!error) return 'generic';
  const message = error.message ?? '';
  for (const [prefix, key] of PREFIXES) if (message.startsWith(prefix)) return key;
  const code = error.code ?? '';
  if (UNAVAILABLE_CODES.includes(code)) return 'migration_pending';
  if (BUSY_CODES.includes(code)) return 'busy';
  return 'generic';
}

export function aboutErrorMessage(error: DbErrorLike): string {
  return ABOUT_MESSAGES[classifyAboutError(error)];
}

/**
 * O erro é esperado (a pessoa vê o texto fixo e basta) ou merece um registro? Conflito, falta de permissão, conteúdo
 * recusado, versão inexistente, banco ocupado e migration pendente são esperados.
 */
export function isExpectedAboutError(error: DbErrorLike): boolean {
  return classifyAboutError(error) !== 'generic';
}
