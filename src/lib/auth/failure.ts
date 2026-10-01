import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';

import { SupabaseEnvError } from '@/lib/supabase/env';

/**
 * Não foi possível descobrir quem é a pessoa: o `getCurrentUser` não conseguiu ler o perfil.
 * Só o código do Postgres fica no erro, nunca dado pessoal.
 */
export class CurrentUserError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`profiles_read_failed:${code}`);
    this.name = 'CurrentUserError';
    this.code = code;
  }
}

/**
 * O Auth está indisponível (rede caída, 502/503/504, 5xx)? O `getClaims()` não lança nesses casos:
 * devolve o erro. "Sem sessão" não é falha e não passa por aqui.
 */
export function isAuthOutage(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  const status = (error as { status?: unknown } | null)?.status;
  return isAuthError(error) && typeof status === 'number' && status >= 500;
}

/**
 * Falha de configuração ou do Auth, daquelas em que o site público segue de pé como visitante.
 * Qualquer outro erro (bug, erro interno do Next) é de quem chamou e não passa por aqui.
 */
export function isAuthFailure(error: unknown): boolean {
  return (
    error instanceof SupabaseEnvError || error instanceof CurrentUserError || isAuthError(error)
  );
}
