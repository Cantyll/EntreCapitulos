import { afterEach, describe, expect, it, vi } from 'vitest';

import { SupabaseEnvError } from '@/lib/supabase/env';

import { describeFailure, logAuthFailure, logProxyFailure } from './log';

const EMAIL = 'leitora.secreta@exemplo.com';
const CODE = '492817';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.segredo.assinatura';

/** Erro parecido com o do Auth, só que cheio de dado pessoal por todo lado. */
class FakeAuthApiError extends Error {
  status = 400;
  code = 'otp_expired';
  email = EMAIL;
  token = CODE;
  headers = { authorization: `Bearer ${TOKEN}`, cookie: `sb=${TOKEN}` };
  response = { url: `https://x.supabase.co/auth/v1/verify?token=${CODE}&email=${EMAIL}` };

  constructor() {
    super(`Token ${CODE} for ${EMAIL} has expired`);
    this.name = 'AuthApiError';
  }
}

describe('describeFailure', () => {
  it('guarda só nome, construtor, status e code', () => {
    expect(describeFailure(new FakeAuthApiError())).toEqual({
      name: 'AuthApiError',
      constructorName: 'FakeAuthApiError',
      status: 400,
      code: 'otp_expired',
    });
  });

  it('nunca deixa e-mail, código, token ou cabeçalhos escaparem', () => {
    const serialized = JSON.stringify(describeFailure(new FakeAuthApiError()));
    for (const secret of [EMAIL, CODE, TOKEN, 'authorization', 'cookie', 'Bearer', 'has expired']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('inclui cause.code nos erros de rede', () => {
    const error = new TypeError(`fetch failed for ${EMAIL}`, { cause: { code: 'ENOTFOUND' } });
    expect(describeFailure(error)).toEqual({
      name: 'TypeError',
      constructorName: 'TypeError',
      causeCode: 'ENOTFOUND',
    });
  });

  it('descarta campo com texto livre em vez de registrá-lo', () => {
    const error = Object.assign(new Error('x'), {
      code: `falha para ${EMAIL}`,
      status: 'ok',
      cause: { code: `token ${CODE}` },
    });
    const summary = describeFailure(error);
    expect(summary.code).toBeUndefined();
    expect(summary.status).toBeUndefined();
    expect(summary.causeCode).toBeUndefined();
  });

  it('não registra o conteúdo de algo que não é erro', () => {
    expect(describeFailure(`o código é ${CODE}`)).toEqual({ name: 'string' });
    expect(describeFailure(null)).toEqual({ name: 'object' });
    expect(JSON.stringify(describeFailure({ message: EMAIL }))).not.toContain(EMAIL);
  });

  it('o erro de configuração leva as variáveis, nunca valores', () => {
    const error = new SupabaseEnvError([
      { variable: 'NEXT_PUBLIC_SUPABASE_URL', reason: 'missing' },
    ]);
    expect(describeFailure(error)).toMatchObject({
      name: 'SupabaseEnvError',
      issues: [{ variable: 'NEXT_PUBLIC_SUPABASE_URL', reason: 'missing' }],
    });
  });
});

describe('logs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logAuthFailure escreve a operação e o resumo, sem a message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logAuthFailure('auth.verifyOtp', new FakeAuthApiError());

    expect(spy).toHaveBeenCalledTimes(1);
    const [label, summary] = spy.mock.calls[0] ?? [];
    expect(label).toBe('auth.verifyOtp falhou');
    expect(summary).toMatchObject({ name: 'AuthApiError', status: 400, code: 'otp_expired' });
    const all = JSON.stringify(spy.mock.calls);
    for (const secret of [EMAIL, CODE, TOKEN]) expect(all).not.toContain(secret);
  });

  it('logProxyFailure registra só o nome do erro', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logProxyFailure(new FakeAuthApiError());

    expect(spy).toHaveBeenCalledWith('proxy falhou', { name: 'AuthApiError' });
  });

  it('logProxyFailure acrescenta as variáveis do erro de configuração', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const issues = [
      { variable: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', reason: 'secret_key' },
    ] as const;
    logProxyFailure(new SupabaseEnvError(issues));

    expect(spy).toHaveBeenCalledWith('proxy falhou', { name: 'SupabaseEnvError', issues });
  });
});
