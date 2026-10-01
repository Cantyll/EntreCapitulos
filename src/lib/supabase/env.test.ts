import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSupabaseEnv, parseSupabaseEnv, SupabaseEnvError } from './env';

const URL_OK = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY_OK = 'sb_publishable_AbCdEfGhIjKlMnOpQrStUvWxYz012345';

function jwt(payload: object): string {
  const part = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}.assinatura-de-teste`;
}

function failure(raw: Parameters<typeof parseSupabaseEnv>[0]): SupabaseEnvError {
  try {
    parseSupabaseEnv(raw);
  } catch (error) {
    if (error instanceof SupabaseEnvError) return error;
    throw error;
  }
  throw new Error('era para lançar SupabaseEnvError');
}

const base = { url: URL_OK, publishableKey: KEY_OK, production: true };

describe('parseSupabaseEnv', () => {
  it('aceita URL https e chave publicável', () => {
    expect(parseSupabaseEnv(base)).toEqual({ url: URL_OK, publishableKey: KEY_OK });
  });

  it('aceita a chave anon legada (JWT com role anon)', () => {
    const anon = jwt({ role: 'anon' });
    expect(parseSupabaseEnv({ ...base, publishableKey: anon }).publishableKey).toBe(anon);
  });

  it('ignora espaços e quebras de linha coladas nas pontas', () => {
    const parsed = parseSupabaseEnv({
      ...base,
      url: ` ${URL_OK}\n`,
      publishableKey: `${KEY_OK} `,
    });
    expect(parsed).toEqual({ url: URL_OK, publishableKey: KEY_OK });
  });

  describe('variável ausente', () => {
    it.each([undefined, '', '   '])('URL %j nomeia a URL', (url) => {
      const error = failure({ ...base, url });
      expect(error.issues).toEqual([{ variable: 'NEXT_PUBLIC_SUPABASE_URL', reason: 'missing' }]);
      expect(error.message).toContain('NEXT_PUBLIC_SUPABASE_URL');
      expect(error.message).not.toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    });

    it.each([undefined, '', '   '])('chave %j nomeia a chave', (publishableKey) => {
      const error = failure({ ...base, publishableKey });
      expect(error.issues).toEqual([
        { variable: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', reason: 'missing' },
      ]);
      expect(error.message).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
      expect(error.message).not.toContain('NEXT_PUBLIC_SUPABASE_URL');
    });

    it('lista as duas quando as duas estão erradas', () => {
      const error = failure({ ...base, url: undefined, publishableKey: undefined });
      expect(error.issues.map((i) => i.variable)).toEqual([
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      ]);
    });
  });

  describe('URL inválida', () => {
    it.each([
      'abcdefghijklmnopqrst.supabase.co',
      'http://abcdefghijklmnopqrst.supabase.co',
      'ftp://abcdefghijklmnopqrst.supabase.co',
      'https://',
      'https:abcdefghijklmnopqrst.supabase.co',
      'not a url',
    ])('recusa %j', (url) => {
      const error = failure({ ...base, url });
      expect(error.issues).toEqual([
        { variable: 'NEXT_PUBLIC_SUPABASE_URL', reason: 'invalid_url' },
      ]);
    });

    it('em produção exige https até para localhost', () => {
      const error = failure({ ...base, url: 'http://127.0.0.1:54321' });
      expect(error.issues[0]?.reason).toBe('invalid_url');
    });

    it.each(['http://localhost:54321', 'http://127.0.0.1:54321', 'http://[::1]:54321'])(
      'fora de produção aceita %s (Supabase local)',
      (url) => {
        expect(parseSupabaseEnv({ ...base, url, production: false }).url).toBe(url);
      },
    );

    it('fora de produção, http só vale para o próprio computador', () => {
      const error = failure({ ...base, url: 'http://exemplo.com', production: false });
      expect(error.issues[0]?.reason).toBe('invalid_url');
    });
  });

  describe('chave secreta no lugar da pública', () => {
    const secret = 'sb_secret_' + 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

    it.each([
      ['sb_secret_', secret],
      ['JWT com role service_role', jwt({ role: 'service_role' })],
      ['texto service_role', 'minha-service_role-key'],
    ])('recusa %s', (_label, publishableKey) => {
      const error = failure({ ...base, publishableKey });
      expect(error.issues).toEqual([
        { variable: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', reason: 'secret_key' },
      ]);
    });

    it('nunca imprime o valor no erro', () => {
      const leak = jwt({ role: 'service_role', ref: 'abcdefghijklmnopqrst' });
      for (const publishableKey of [secret, leak]) {
        const error = failure({ ...base, publishableKey });
        expect(error.message).not.toContain(publishableKey);
        expect(error.message).not.toContain(publishableKey.slice(0, 12));
        expect(JSON.stringify(error.issues)).not.toContain(publishableKey);
      }
    });

    it('nunca imprime a URL no erro', () => {
      const error = failure({ ...base, url: 'http://segredo.exemplo.com/x' });
      expect(error.message).not.toContain('segredo.exemplo.com');
    });
  });

  it('o erro tem um nome estável para o log', () => {
    expect(failure({ ...base, url: undefined }).name).toBe('SupabaseEnvError');
  });
});

describe('getSupabaseEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lê as duas variáveis do ambiente', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_OK);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', KEY_OK);
    expect(getSupabaseEnv()).toEqual({ url: URL_OK, publishableKey: KEY_OK });
  });

  it('lança com o nome da variável ausente', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', KEY_OK);
    expect(() => getSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('usa NODE_ENV para decidir sobre o http local', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', KEY_OK);

    vi.stubEnv('NODE_ENV', 'development');
    expect(getSupabaseEnv().url).toBe('http://127.0.0.1:54321');

    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
