/*
 * Variáveis públicas do Supabase, lidas e validadas num só lugar. Quando algo está errado, o erro
 * diz QUAL variável (e o motivo), mas nunca imprime o valor: ele pode ser uma chave secreta
 * colada por engano.
 *
 * As referências a `process.env.NEXT_PUBLIC_*` em `getSupabaseEnv` precisam ser literais para o
 * Next trocá-las no bundle do navegador. A leitura acontece só quando o cliente é criado (e não
 * ao importar o módulo), para o `next build` passar sem `.env`.
 */

export const SUPABASE_URL_VARIABLE = 'NEXT_PUBLIC_SUPABASE_URL';
export const SUPABASE_KEY_VARIABLE = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

export type SupabaseEnvVariable = typeof SUPABASE_URL_VARIABLE | typeof SUPABASE_KEY_VARIABLE;
export type SupabaseEnvReason = 'missing' | 'invalid_url' | 'secret_key';
export type SupabaseEnvIssue = { variable: SupabaseEnvVariable; reason: SupabaseEnvReason };

const REASON_TEXT: Record<SupabaseEnvReason, string> = {
  missing: 'não está definida',
  invalid_url: 'não é uma URL válida (precisa começar com https://)',
  secret_key:
    'parece uma chave secreta (secret/service_role); use só a chave pública sb_publishable_…',
};

/** Erro de configuração. `issues` só tem nomes de variável e motivos, nunca valores. */
export class SupabaseEnvError extends Error {
  readonly issues: readonly SupabaseEnvIssue[];

  constructor(issues: readonly SupabaseEnvIssue[]) {
    super(
      `${issues.map((i) => `${i.variable} ${REASON_TEXT[i.reason]}`).join('; ')}. Veja o .env.example.`,
    );
    this.name = 'SupabaseEnvError';
    this.issues = issues;
  }
}

/** `http://` só vale para o Supabase local, e nunca em produção. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isValidUrl(value: string, production: boolean): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!url.hostname) return false;
  if (url.protocol === 'https:') return true;
  return !production && LOOPBACK_HOSTS.has(url.hostname);
}

/** Papel (`role`) de um JWT legado (anon / service_role), sem validar a assinatura. */
function jwtRole(value: string): string | null {
  const parts = value.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const role = (payload as { role?: unknown } | null)?.role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

function looksPrivileged(key: string): boolean {
  return (
    key.startsWith('sb_secret_') || /service_?role/i.test(key) || jwtRole(key) === 'service_role'
  );
}

export type RawSupabaseEnv = {
  url: string | undefined;
  publishableKey: string | undefined;
  /** `NODE_ENV === 'production'`: exige https:// mesmo para localhost. */
  production: boolean;
};

/** Valida os valores já lidos. Pura, para poder ser testada sem mexer em `process.env`. */
export function parseSupabaseEnv(raw: RawSupabaseEnv): { url: string; publishableKey: string } {
  const url = raw.url?.trim();
  const publishableKey = raw.publishableKey?.trim();
  const issues: SupabaseEnvIssue[] = [];

  if (!url) issues.push({ variable: SUPABASE_URL_VARIABLE, reason: 'missing' });
  else if (!isValidUrl(url, raw.production)) {
    issues.push({ variable: SUPABASE_URL_VARIABLE, reason: 'invalid_url' });
  }

  if (!publishableKey) issues.push({ variable: SUPABASE_KEY_VARIABLE, reason: 'missing' });
  else if (looksPrivileged(publishableKey)) {
    issues.push({ variable: SUPABASE_KEY_VARIABLE, reason: 'secret_key' });
  }

  if (issues.length > 0 || !url || !publishableKey) throw new SupabaseEnvError(issues);
  return { url, publishableKey };
}

export function getSupabaseEnv(): { url: string; publishableKey: string } {
  return parseSupabaseEnv({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    production: process.env.NODE_ENV === 'production',
  });
}
