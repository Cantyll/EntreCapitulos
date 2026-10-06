/*
 * Erros do banco no aceite dos Termos (`accept_terms`) e na leitura de `terms_acceptances`, em pt-BR. Só lê `code` e
 * o prefixo da `message` para classificar; nada disso vai para a tela nem para o log (o log usa `logFailure`).
 */
type DbErrorLike = { code?: string | null; message?: string | null };

export const TERMS_MESSAGES = {
  required:
    'Para continuar, marque a caixa: ela vale como a sua declaração de ter 18 anos ou mais e o aceite dos Termos e da Política de Privacidade.',
  /** A função do banco ainda não existe (migration não aplicada). O nome, se havia, já foi salvo. */
  unavailable: 'Este recurso ainda não está disponível. Tente de novo mais tarde.',
  not_signed_in: 'Entre de novo para aceitar os Termos.',
  generic: 'Não foi possível registrar o aceite agora. Tente de novo em instantes.',
} as const;

export type TermsMessageKey = keyof typeof TERMS_MESSAGES;

/** Função ou tabela ausente: PGRST202/PGRST205/PGRST200 (PostgREST) e 42883/42P01 (Postgres). */
export function isTermsUnavailable(error: DbErrorLike | null | undefined): boolean {
  const code = error?.code ?? '';
  return ['PGRST202', 'PGRST205', 'PGRST200', '42883', '42P01'].includes(code);
}

export function classifyAcceptError(error: DbErrorLike | null | undefined): TermsMessageKey {
  if (!error) return 'generic';
  if (isTermsUnavailable(error)) return 'unavailable';
  const message = error.message ?? '';
  if (message.startsWith('not_signed_in:') || error.code === '42501') return 'not_signed_in';
  return 'generic';
}
