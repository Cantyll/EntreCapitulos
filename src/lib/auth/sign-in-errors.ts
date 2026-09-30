/**
 * Mensagens do login. `/entrar?erro=…` só aceita os códigos desta lista: o valor recebido nunca
 * aparece na página.
 */

export const SIGN_IN_PAGE_ERRORS = {
  google: 'Não foi possível entrar com o Google. Tente de novo ou use o código por e-mail.',
  retorno: 'O retorno do login expirou ou não é válido. Tente entrar de novo.',
  indisponivel: 'O login está indisponível agora. Tente de novo em alguns minutos.',
} as const;

export type SignInPageError = keyof typeof SIGN_IN_PAGE_ERRORS;

export function signInPageErrorMessage(code: unknown): string | null {
  if (typeof code !== 'string' || !Object.hasOwn(SIGN_IN_PAGE_ERRORS, code)) return null;
  return SIGN_IN_PAGE_ERRORS[code as SignInPageError];
}

/** Erros do fluxo do código por e-mail, devolvidos pelas Server Actions. */
export const OTP_ERRORS = {
  invalid_email: 'Confira o e-mail: ele não parece válido.',
  invalid_code: 'Código incorreto ou expirado. Confira os 6 dígitos ou peça um novo código.',
  rate_limited: 'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
  unavailable: 'O login está indisponível agora. Tente de novo em alguns minutos.',
} as const;

export type OtpError = keyof typeof OTP_ERRORS;

/** Traduz o `code` de um AuthError do Supabase. A mensagem crua nunca chega à tela. */
export function otpErrorFromAuthCode(code: string | undefined, step: 'send' | 'verify'): OtpError {
  switch (code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'rate_limited';
    case 'otp_expired':
    case 'invalid_credentials':
      return 'invalid_code';
    case 'email_address_invalid':
    case 'email_address_not_authorized':
    case 'validation_failed':
      return step === 'send' ? 'invalid_email' : 'invalid_code';
    default:
      return step === 'verify' ? 'invalid_code' : 'unavailable';
  }
}
