/** Tamanho do código por e-mail. O painel do Supabase precisa estar configurado com o mesmo valor. */
export const OTP_LENGTH = 6;

/** Segundos de espera antes de pedir outro código (o Supabase também limita por conta própria). */
export const OTP_RESEND_SECONDS = 60;

/** Cookie com o destino do login pelo Google. Só existe entre o clique e o /auth/callback. */
export const NEXT_COOKIE = 'ec_next';
export const NEXT_COOKIE_PATH = '/auth/callback';
export const NEXT_COOKIE_MAX_AGE = 60 * 10;

/** Cabeçalho que o proxy preenche com o caminho pedido, para o `requireUser` saber o `next`. */
export const PATH_HEADER = 'x-ec-path';

/** Campo que o widget do Cloudflare Turnstile escreve dentro do formulário de envio do código. */
export const CAPTCHA_FIELD = 'cf-turnstile-response';
/** Tamanho máximo do token do Turnstile (limite documentado pela Cloudflare). */
export const CAPTCHA_TOKEN_MAX = 2048;
