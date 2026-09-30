/**
 * Tamanho do código enviado por e-mail. Precisa ser igual ao configurado no painel do Supabase
 * (ver o README): se lá estiver diferente de 6, nenhum código vai validar.
 */
export const OTP_LENGTH = 6;

/** Espera, em segundos, antes de pedir outro código. */
export const OTP_RESEND_SECONDS = 60;

/**
 * Cabeçalho interno com o caminho pedido. O proxy sempre sobrescreve o valor (quem chama não
 * consegue forjar), e `requireUser()` usa para montar o `next` do login.
 */
export const PATH_HEADER = 'x-ec-path';

/** Cookie que guarda o `next` durante a ida e volta ao Google. */
export const OAUTH_NEXT_COOKIE = 'ec-oauth-next';
export const OAUTH_CALLBACK_PATH = '/auth/callback';
export const OAUTH_NEXT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  // Strict quebraria a volta do Google (navegação iniciada em outro site).
  sameSite: 'lax',
  path: OAUTH_CALLBACK_PATH,
  maxAge: 10 * 60,
} as const;
