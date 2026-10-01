import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';

/**
 * O Auth está indisponível (rede caída, 502/503/504, 5xx)? O `getClaims()` não lança nesses casos:
 * devolve o erro. "Sem sessão" não é falha e não passa por aqui.
 */
export function isAuthOutage(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  const status = (error as { status?: unknown } | null)?.status;
  return isAuthError(error) && typeof status === 'number' && status >= 500;
}
