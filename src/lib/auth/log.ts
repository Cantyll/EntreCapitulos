import { SupabaseEnvError, type SupabaseEnvIssue } from '@/lib/supabase/env';

/*
 * Registro de falhas de autenticação. Só sai daqui o que ajuda a diagnosticar e não pode vazar
 * nada: nome e construtor do erro, `status`, `code` e, para erro de rede, `cause.code`. Nunca a
 * `message` (o Auth costuma repetir o e-mail nela), nem e-mail, código, token ou cabeçalhos.
 *
 * Cada campo ainda passa por uma lista de caracteres seguros: se um deles trouxer texto livre por
 * engano, ele é descartado em vez de ir para o log.
 */

const SAFE_TEXT = /^[A-Za-z0-9_.:-]{1,64}$/;

function safeText(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_TEXT.test(value) ? value : undefined;
}

function safeStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1000
    ? value
    : undefined;
}

export type FailureSummary = {
  name?: string;
  constructorName?: string;
  status?: number;
  code?: string;
  causeCode?: string;
  /** Só no `SupabaseEnvError`: nomes de variável e motivos, nunca valores. */
  issues?: readonly SupabaseEnvIssue[];
};

export function describeFailure(error: unknown): FailureSummary {
  // Algo que não é objeto (um `throw 'texto'`) pode ter qualquer coisa dentro: só o tipo é seguro.
  if (typeof error !== 'object' || error === null) return { name: typeof error };

  const { name, status, code, cause } = error as Record<string, unknown>;
  const causeCode =
    typeof cause === 'object' && cause !== null ? (cause as { code?: unknown }).code : undefined;

  const summary: FailureSummary = {
    name: safeText(name),
    constructorName: safeText(error.constructor?.name),
    status: safeStatus(status),
    code: safeText(code),
    causeCode: safeText(causeCode),
    issues: error instanceof SupabaseEnvError ? error.issues : undefined,
  };
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined),
  ) as FailureSummary;
}

/** Registra uma falha (Auth, Storage, banco, sharp…) sem dado pessoal: ver `describeFailure`. */
export function logFailure(operation: string, error: unknown): void {
  console.error(`${operation} falhou`, describeFailure(error));
}

/** Registra uma falha de autenticação (OTP, verificação, Google, sair…) sem dado pessoal. */
export const logAuthFailure = logFailure;

/** O proxy registra só o nome do erro (e, no erro de configuração, quais variáveis falharam). */
export function logProxyFailure(error: unknown): void {
  const { name, issues } = describeFailure(error);
  console.error('proxy falhou', { name, ...(issues ? { issues } : {}) });
}
