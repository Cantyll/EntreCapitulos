/*
 * Chaves de funcionalidade. São variáveis `NEXT_PUBLIC_*`, então o Next as embute no código na
 * hora do build: mudar o valor na Vercel só vale depois de um novo deploy. A referência a
 * `process.env.NEXT_PUBLIC_*` precisa ser literal para o Next conseguir trocá-la.
 */

/** O botão "Continuar com Google" só aparece com `NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED=true`. */
export function isGoogleLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED === 'true';
}
