/*
 * Chaves de funcionalidade. São variáveis `NEXT_PUBLIC_*`, então o Next as embute no código na
 * hora do build: mudar o valor na Vercel só vale depois de um novo deploy. A referência a
 * `process.env.NEXT_PUBLIC_*` precisa ser literal para o Next conseguir trocá-la.
 */

/** O botão "Continuar com Google" só aparece com `NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED=true`. */
export function isGoogleLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED === 'true';
}

/**
 * A verificação de segurança (Cloudflare Turnstile) do envio do código só liga com
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Sem a variável o login funciona como sempre. A chave é pública (a Site
 * Key); a Secret Key fica só no painel do Supabase.
 */
export function getTurnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return key ? key : null;
}

export function isTurnstileEnabled(): boolean {
  return getTurnstileSiteKey() !== null;
}
