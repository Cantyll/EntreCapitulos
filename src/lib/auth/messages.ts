/*
 * Mensagens de erro do login, todas em pt-BR. Nenhuma mensagem do Supabase chega à tela, e o
 * parâmetro `?erro=` da URL só vale se for um código desta lista: o valor recebido nunca é
 * mostrado.
 */

const LOGIN_ERRORS = {
  oauth: 'Não foi possível entrar com o Google. Tente de novo.',
  acesso_negado: 'O acesso com o Google foi cancelado. Você pode tentar de novo ou usar o e-mail.',
  sessao: 'Sua sessão terminou. Entre de novo para continuar.',
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

export function loginErrorMessage(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  return Object.hasOwn(LOGIN_ERRORS, code) ? LOGIN_ERRORS[code as LoginErrorCode] : null;
}

export const OTP_MESSAGES = {
  email_invalid: 'Esse e-mail não parece certo. Confira e tente de novo.',
  rate_limited: 'Você pediu códigos demais. Espere um minuto e tente de novo.',
  send_failed: 'Não conseguimos enviar o código agora. Tente de novo em instantes.',
  code_format: 'Digite os 6 números do código que enviamos por e-mail.',
  code_invalid: 'Esse código não está certo ou já expirou. Confira ou peça um novo.',
  generic: 'Algo deu errado. Tente de novo.',
} as const;

export type OtpErrorKey = keyof typeof OTP_MESSAGES;

type AuthErrorLike = { code?: string | null; status?: number | null };

/** Traduz o erro do Auth para uma chave de mensagem, olhando só o `code` e o status. */
export function classifyOtpSendError(error: AuthErrorLike): OtpErrorKey {
  const code = error.code ?? '';
  if (error.status === 429 || code.includes('rate_limit')) return 'rate_limited';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'email_invalid';
  if (code === 'unexpected_failure' || (error.status ?? 0) >= 500) return 'send_failed';
  return 'generic';
}

export function classifyOtpVerifyError(error: AuthErrorLike): OtpErrorKey {
  const code = error.code ?? '';
  if (error.status === 429 || code.includes('rate_limit')) return 'rate_limited';
  if (code === 'otp_expired' || code === 'validation_failed' || error.status === 403) {
    return 'code_invalid';
  }
  if ((error.status ?? 0) >= 500) return 'send_failed';
  return 'generic';
}
