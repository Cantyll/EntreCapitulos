import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * O proxy nunca derruba o site público e nunca libera o painel. O cliente do Supabase é um
 * dublê, para simular o Auth fora do ar.
 */

const getClaims = vi.fn();
const createServerClient = vi.fn((..._args: unknown[]) => ({ auth: { getClaims } }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}));

const { proxy } = await import('./proxy');

const SEGREDO = 'ECONNREFUSED 10.1.2.3:443 token=eyJsegredo';

const request = (path: string) => new NextRequest(`http://localhost:3000${path}`);
/** Resposta `NextResponse.next()`: deixa a requisição seguir para a página. */
const passes = (response: Response) => response.headers.get('x-middleware-next') === '1';

describe('proxy', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_AbCdEfGhIjKlMnOpQrStUvWx');
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('funcionamento normal', () => {
    it('deixa passar o site público sem sessão', async () => {
      getClaims.mockResolvedValue({ data: null, error: null });
      const response = await proxy(request('/sessoes'));
      expect(passes(response)).toBe(true);
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('manda o painel sem sessão para o login', async () => {
      getClaims.mockResolvedValue({ data: null, error: null });
      const response = await proxy(request('/painel/livros'));
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/entrar?next=%2Fpainel%2Flivros',
      );
    });

    it('trata o login anônimo como deslogado', async () => {
      getClaims.mockResolvedValue({
        data: { claims: { sub: 'u1', is_anonymous: true } },
        error: null,
      });
      const response = await proxy(request('/painel'));
      expect(response.status).toBe(307);
    });

    it('deixa quem tem sessão abrir o painel (o papel é conferido no servidor)', async () => {
      getClaims.mockResolvedValue({ data: { claims: { sub: 'u1' } }, error: null });
      expect(passes(await proxy(request('/painel')))).toBe(true);
    });
  });

  describe.each([
    ['o Auth lança uma exceção', () => getClaims.mockRejectedValue(new TypeError(SEGREDO))],
    [
      'o Auth devolve erro de rede (AuthRetryableFetchError)',
      () =>
        getClaims.mockResolvedValue({
          data: null,
          error: new AuthRetryableFetchError(SEGREDO, 0),
        }),
    ],
    [
      'a criação do cliente lança',
      () =>
        createServerClient.mockImplementationOnce(() => {
          throw new Error(SEGREDO);
        }),
    ],
  ])('quando %s', (_label, breakAuth) => {
    beforeEach(() => {
      breakAuth();
    });

    it.each(['/', '/sessoes', '/livros/o-livro-de-azrael', '/entrar', '/auth/callback'])(
      'deixa a rota pública %s passar',
      async (path) => {
        const response = await proxy(request(path));
        expect(passes(response)).toBe(true);
        expect(response.status).toBe(200);
      },
    );

    it.each(['/painel', '/painel/livros', '/painel/comentarios'])(
      'responde 503 em %s, sem liberar o painel',
      async (path) => {
        const response = await proxy(request(path));
        expect(response.status).toBe(503);
        expect(passes(response)).toBe(false);
        expect(response.headers.get('content-type')).toContain('text/html');
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('location')).toBeNull();
      },
    );

    it('a página 503 é simples, em pt-BR e sem detalhe técnico', async () => {
      const html = await (await proxy(request('/painel'))).text();
      expect(html).toContain('lang="pt-BR"');
      expect(html).toContain('Painel indisponível');
      expect(html).toContain('Tente de novo em instantes');
      expect(html).toContain('href="/"');
      for (const leak of [SEGREDO, 'ECONNREFUSED', 'TypeError', 'Supabase', 'supabase', 'stack']) {
        expect(html).not.toContain(leak);
      }
    });

    it('registra só o nome do erro, nunca a mensagem', async () => {
      await proxy(request('/painel'));
      expect(errorLog).toHaveBeenCalledTimes(1);
      const [label, summary] = errorLog.mock.calls[0] ?? [];
      expect(label).toBe('proxy falhou');
      expect(Object.keys(summary as object)).toEqual(['name']);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('ECONNREFUSED');
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('eyJsegredo');
    });
  });

  describe('variável de ambiente ausente ou errada', () => {
    it.each([
      ['NEXT_PUBLIC_SUPABASE_URL', ''],
      ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ''],
      ['NEXT_PUBLIC_SUPABASE_URL', 'http://exemplo.com'],
    ])('%s=%j: o público passa e o painel dá 503', async (name, value) => {
      vi.stubEnv(name, value);

      expect(passes(await proxy(request('/sessoes')))).toBe(true);
      expect((await proxy(request('/painel'))).status).toBe(503);
      expect(createServerClient).not.toHaveBeenCalled();
    });

    it('o log diz qual variável falhou, sem valor', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://exemplo.com');
      await proxy(request('/'));

      expect(errorLog).toHaveBeenCalledWith('proxy falhou', {
        name: 'SupabaseEnvError',
        issues: [{ variable: 'NEXT_PUBLIC_SUPABASE_URL', reason: 'invalid_url' }],
      });
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('exemplo.com');
    });
  });
});
