import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseEnvError } from '@/lib/supabase/env';

/*
 * As Server Actions de login rodando de verdade, com o cliente do Supabase trocado por um
 * dublê. O que importa aqui: o aviso que a pessoa vê, e que NADA do que vai para o log carrega
 * e-mail, código ou token.
 */

const EMAIL = 'leitora.secreta@exemplo.com';
const CODE = '492817';

const auth = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  exchangeCodeForSession: vi.fn(),
};
const createClient = vi.fn(async () => ({ auth }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }));
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

// Importados depois dos mocks.
const { sendCode, verifyCode, signInWithGoogle } = await import('@/app/(public)/entrar/actions');
const { signOut } = await import('@/lib/auth/sign-out');
const { GET: authCallback } = await import('@/app/auth/callback/route');

const emptySend = { sent: false, email: '', sentAt: null, error: null } as const;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** Tudo o que foi para console.error, como texto, para procurar vazamento. */
function logged(spy: ReturnType<typeof vi.spyOn>): string {
  return JSON.stringify(spy.mock.calls);
}

function networkError(): TypeError {
  return new TypeError(`fetch failed (${EMAIL}, ${CODE})`, { cause: { code: 'ENOTFOUND' } });
}

describe('registro de falhas de autenticação', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    createClient.mockImplementation(async () => ({ auth }));
  });

  describe('sendCode', () => {
    it('erro do Auth sem status nem code mostra o aviso de envio, sem vazar o e-mail', async () => {
      auth.signInWithOtp.mockResolvedValue({
        error: Object.assign(new Error(`Error sending to ${EMAIL}`), { name: 'AuthUnknownError' }),
      });

      const state = await sendCode(emptySend, form({ email: EMAIL }));

      expect(state.error).toBe('send_failed');
      expect(errorLog).toHaveBeenCalledWith(
        'auth.signInWithOtp falhou',
        expect.objectContaining({ name: 'AuthUnknownError' }),
      );
      expect(logged(errorLog)).not.toContain(EMAIL);
    });

    it('erro de rede lançado vira aviso, registra cause.code e não vaza o e-mail', async () => {
      auth.signInWithOtp.mockRejectedValue(networkError());

      const state = await sendCode(emptySend, form({ email: EMAIL }));

      expect(state).toMatchObject({ sent: false, error: 'send_failed' });
      expect(errorLog).toHaveBeenCalledWith(
        'auth.signInWithOtp falhou',
        expect.objectContaining({ name: 'TypeError', causeCode: 'ENOTFOUND' }),
      );
      expect(logged(errorLog)).not.toContain(EMAIL);
      expect(logged(errorLog)).not.toContain(CODE);
    });

    it('variável de ambiente errada não derruba a ação', async () => {
      createClient.mockRejectedValue(
        new SupabaseEnvError([{ variable: 'NEXT_PUBLIC_SUPABASE_URL', reason: 'missing' }]),
      );

      const state = await sendCode(emptySend, form({ email: EMAIL }));

      expect(state.error).toBe('send_failed');
      expect(errorLog).toHaveBeenCalledWith(
        'auth.signInWithOtp falhou',
        expect.objectContaining({
          name: 'SupabaseEnvError',
          issues: [{ variable: 'NEXT_PUBLIC_SUPABASE_URL', reason: 'missing' }],
        }),
      );
    });

    it('envio com sucesso não registra nada', async () => {
      auth.signInWithOtp.mockResolvedValue({ error: null });
      const state = await sendCode(emptySend, form({ email: EMAIL }));
      expect(state.sent).toBe(true);
      expect(errorLog).not.toHaveBeenCalled();
    });
  });

  describe('verifyCode', () => {
    it('código errado registra só nome, status e code', async () => {
      auth.verifyOtp.mockResolvedValue({
        data: { user: null },
        error: Object.assign(new Error(`Token ${CODE} for ${EMAIL} has expired`), {
          name: 'AuthApiError',
          status: 403,
          code: 'otp_expired',
        }),
      });

      const state = await verifyCode({ error: null }, form({ email: EMAIL, token: CODE }));

      expect(state.error).toBe('code_invalid');
      expect(errorLog).toHaveBeenCalledWith(
        'auth.verifyOtp falhou',
        expect.objectContaining({ name: 'AuthApiError', status: 403, code: 'otp_expired' }),
      );
      expect(logged(errorLog)).not.toContain(EMAIL);
      expect(logged(errorLog)).not.toContain(CODE);
    });

    it('erro sem status nem code pede para tentar de novo', async () => {
      auth.verifyOtp.mockRejectedValue(networkError());

      const state = await verifyCode({ error: null }, form({ email: EMAIL, token: CODE }));

      expect(state.error).toBe('verify_failed');
      expect(logged(errorLog)).not.toContain(EMAIL);
      expect(logged(errorLog)).not.toContain(CODE);
    });
  });

  describe('Google', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED', 'true');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('falha ao iniciar volta para /entrar com o aviso, registrando só o resumo', async () => {
      auth.signInWithOAuth.mockRejectedValue(networkError());

      await expect(signInWithGoogle(form({ next: '/' }))).rejects.toThrow(
        'NEXT_REDIRECT:/entrar?erro=oauth',
      );
      expect(errorLog).toHaveBeenCalledWith(
        'auth.signInWithOAuth falhou',
        expect.objectContaining({ causeCode: 'ENOTFOUND' }),
      );
      expect(logged(errorLog)).not.toContain(EMAIL);
    });
  });

  describe('/auth/callback', () => {
    it('falha na troca do code volta para /entrar sem registrar o code da URL', async () => {
      auth.exchangeCodeForSession.mockResolvedValue({
        data: { user: null },
        error: Object.assign(new Error(`invalid code ${CODE}`), {
          name: 'AuthApiError',
          status: 400,
          code: 'flow_state_not_found',
        }),
      });
      const { NextRequest } = await import('next/server');

      const response = await authCallback(
        new NextRequest(`http://localhost:3000/auth/callback?code=${CODE}`),
      );

      expect(response.headers.get('location')).toContain('/entrar?erro=oauth');
      expect(errorLog).toHaveBeenCalledWith(
        'auth.exchangeCodeForSession falhou',
        expect.objectContaining({ code: 'flow_state_not_found', status: 400 }),
      );
      expect(logged(errorLog)).not.toContain(CODE);
    });
  });

  describe('signOut', () => {
    it('registra a falha, não vaza dado e sai do mesmo jeito', async () => {
      auth.signOut.mockRejectedValue(networkError());

      await expect(signOut()).rejects.toThrow('NEXT_REDIRECT:/');
      expect(errorLog).toHaveBeenCalledWith(
        'auth.signOut falhou',
        expect.objectContaining({ causeCode: 'ENOTFOUND' }),
      );
      expect(logged(errorLog)).not.toContain(EMAIL);
    });
  });
});
