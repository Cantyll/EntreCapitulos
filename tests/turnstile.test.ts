import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyOtpSendError, OTP_MESSAGES } from '@/lib/auth/messages';

/*
 * Cloudflare Turnstile no envio do código: sem a variável tudo funciona como antes; com ela o botão espera a
 * verificação, e o token vai a `signInWithOtp({ options: { captchaToken } })`. O widget de verdade não roda
 * aqui (precisa do navegador e da rede da Cloudflare): ver o PR para o que ficou sem teste de ponta a ponta.
 */

const auth = { signInWithOtp: vi.fn(), verifyOtp: vi.fn() };
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth }) }));
vi.mock('@/lib/auth/session', () => ({ isNameConfirmed: vi.fn(async () => true) }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: vi.fn(), get: vi.fn() }),
  headers: async () => new Headers({ host: 'localhost:3000' }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
const logAuthFailure = vi.fn();
vi.mock('@/lib/auth/log', () => ({ logAuthFailure: (...a: unknown[]) => logAuthFailure(...a) }));

const { sendCode } = await import('@/app/(public)/entrar/actions');
const { SignInForm } = await import('@/components/auth/SignInForm');
const { getTurnstileSiteKey, isTurnstileEnabled } = await import('@/lib/auth/features');

const idle = { sent: false, email: '', sentAt: null, error: null } as const;
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const EMAIL = 'leitora@exemplo.com';

beforeEach(() => {
  auth.signInWithOtp.mockResolvedValue({ error: null });
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('a variável NEXT_PUBLIC_TURNSTILE_SITE_KEY', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['0x4AAAAAAAtestkey', '0x4AAAAAAAtestkey'],
    ['  0x4AAAAAAAtestkey  ', '0x4AAAAAAAtestkey'],
  ])('%j → %j', (value, expected) => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', value);
    expect(getTurnstileSiteKey()).toBe(expected);
    expect(isTurnstileEnabled()).toBe(expected !== null);
  });

  it('ausente (undefined) também é desligado', () => {
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    expect(isTurnstileEnabled()).toBe(false);
  });
});

describe('formulário de entrada (marcação do servidor)', () => {
  const render = (turnstileSiteKey?: string | null) =>
    renderToStaticMarkup(
      createElement(SignInForm, { next: '/', initialError: null, turnstileSiteKey }),
    );

  it('sem a chave: nenhum widget, e o botão de enviar fica habilitado, como hoje', () => {
    for (const html of [render(), render(null)]) {
      expect(html).not.toMatch(/captcha/i);
      expect(html).not.toContain('Verificação');
      expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Receber código por e-mail<\/button>/);
      expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Receber código por e-mail/);
    }
  });

  it('com a chave: o widget tem lugar no formulário e o botão espera a verificação', () => {
    const html = render('0x4AAAAAAAtestkey');
    expect(html).toMatch(/captcha/i);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Receber código por e-mail<\/button>/);
  });

  it('a Site Key nunca vai para a marcação do servidor (o widget a recebe no navegador)', () => {
    expect(render('0x4AAAAAAAtestkey')).not.toContain('0x4AAAAAAAtestkey');
  });
});

describe('sendCode e o captchaToken', () => {
  it('SEM a variável: não exige token e não manda captchaToken (igual a hoje)', async () => {
    const state = await sendCode(idle, form({ email: EMAIL }));
    expect(state.sent).toBe(true);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: EMAIL,
      options: { shouldCreateUser: true },
    });
  });

  it('SEM a variável: um token que apareça no formulário é ignorado', async () => {
    await sendCode(idle, form({ email: EMAIL, 'cf-turnstile-response': 'token-qualquer' }));
    expect(auth.signInWithOtp.mock.calls[0]![0].options).toEqual({ shouldCreateUser: true });
  });

  it('COM a variável: repassa o token ao signInWithOtp', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '0x4AAAAAAAtestkey');
    const state = await sendCode(
      idle,
      form({ email: EMAIL, 'cf-turnstile-response': '  token-da-cloudflare  ' }),
    );
    expect(state.sent).toBe(true);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: EMAIL,
      options: { shouldCreateUser: true, captchaToken: 'token-da-cloudflare' },
    });
  });

  it.each([
    ['sem o campo', {}],
    ['vazio', { 'cf-turnstile-response': '' }],
    ['só espaços', { 'cf-turnstile-response': '   ' }],
    ['grande demais', { 'cf-turnstile-response': 'x'.repeat(2049) }],
  ])('COM a variável e token %s: não chama o Auth e avisa em pt-BR', async (_label, fields) => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '0x4AAAAAAAtestkey');
    const state = await sendCode(idle, form({ email: EMAIL, ...fields }));
    expect(state).toMatchObject({ sent: false, error: 'captcha_failed' });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('o Auth recusar o CAPTCHA (captcha_failed) vira a mensagem pedida, sem vazar o token', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '0x4AAAAAAAtestkey');
    auth.signInWithOtp.mockResolvedValue({
      error: Object.assign(new Error('captcha protection: request disallowed'), {
        status: 400,
        code: 'captcha_failed',
      }),
    });
    const state = await sendCode(
      idle,
      form({ email: EMAIL, 'cf-turnstile-response': 'tok-secreto' }),
    );
    expect(state.error).toBe('captcha_failed');
    expect(OTP_MESSAGES.captcha_failed).toBe(
      'Não conseguimos confirmar que você é uma pessoa. Tente de novo.',
    );
    expect(JSON.stringify(logAuthFailure.mock.calls)).not.toContain('tok-secreto');
  });

  it('sem a variável no site mas com o CAPTCHA ligado no Supabase: o erro dele também é mapeado', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { status: 400, code: 'captcha_failed' } });
    expect((await sendCode(idle, form({ email: EMAIL }))).error).toBe('captcha_failed');
  });
});

describe('mapeamento do erro', () => {
  it.each([
    [{ code: 'captcha_failed', status: 400 }, 'captcha_failed'],
    [{ code: 'over_email_send_rate_limit', status: 429 }, 'rate_limited'],
    [{ code: 'email_address_invalid', status: 400 }, 'email_invalid'],
  ] as const)('%j → %s', (error, key) => {
    expect(classifyOtpSendError(error)).toBe(key);
  });
});

describe('verifyCode e o Google não levam captchaToken', () => {
  it('o código de 6 dígitos é conferido só com e-mail, código e tipo', async () => {
    const { verifyCode } = await import('@/app/(public)/entrar/actions');
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    await verifyCode(
      { error: null },
      form({ email: EMAIL, token: '123456', 'cf-turnstile-response': 'valor-do-widget' }),
    ).catch(() => {});
    const args = auth.verifyOtp.mock.calls[0]?.[0];
    expect(args).toBeDefined();
    expect(JSON.stringify(args)).not.toContain('captcha');
    expect(JSON.stringify(args)).not.toContain('valor-do-widget');
  });
});
