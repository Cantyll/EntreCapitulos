import { describe, expect, it } from 'vitest';

import {
  classifyOtpSendError,
  classifyOtpVerifyError,
  loginErrorMessage,
  OTP_MESSAGES,
} from './messages';

describe('loginErrorMessage', () => {
  it('só aceita códigos da lista fixa', () => {
    expect(loginErrorMessage('oauth')).toContain('Google');
    expect(loginErrorMessage('acesso_negado')).not.toBeNull();
  });

  it.each(['<script>alert(1)</script>', 'constructor', '__proto__', 'toString', '', undefined, 5])(
    'ignora %j',
    (value) => {
      expect(loginErrorMessage(value)).toBeNull();
    },
  );
});

describe('classificação dos erros do Auth', () => {
  it('reconhece limite de envio', () => {
    expect(classifyOtpSendError({ code: 'over_email_send_rate_limit', status: 429 })).toBe(
      'rate_limited',
    );
  });

  it('reconhece e-mail inválido', () => {
    expect(classifyOtpSendError({ code: 'email_address_invalid', status: 400 })).toBe(
      'email_invalid',
    );
  });

  it('código errado ou expirado', () => {
    expect(classifyOtpVerifyError({ code: 'otp_expired', status: 403 })).toBe('code_invalid');
  });

  it('o resto vira mensagem genérica', () => {
    expect(classifyOtpSendError({ code: 'algo_novo', status: 400 })).toBe('generic');
    expect(classifyOtpVerifyError({ code: 'algo_novo', status: 400 })).toBe('generic');
  });

  it('erro sem status nem code (rede) pede para tentar de novo', () => {
    expect(classifyOtpSendError({})).toBe('send_failed');
    expect(classifyOtpSendError({ status: 0 })).toBe('send_failed');
    expect(classifyOtpSendError({ code: null, status: null })).toBe('send_failed');
    expect(OTP_MESSAGES.send_failed).toBe(
      'Não conseguimos enviar o código agora. Tente de novo em instantes.',
    );
  });

  it('na verificação, o mesmo caso fala em confirmar o código', () => {
    expect(classifyOtpVerifyError({})).toBe('verify_failed');
    expect(classifyOtpVerifyError({ status: 503 })).toBe('verify_failed');
    expect(OTP_MESSAGES.verify_failed).toContain('confirmar');
  });
});
