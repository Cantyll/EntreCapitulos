import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A CSP no proxy: sai em TODA resposta (inclusive as de falha, o 503 do painel e o redirecionamento ao login),
 * o nonce do cabeçalho da resposta é o MESMO que o Next recebe pelo cabeçalho da requisição, e a variável
 * CSP_REPORT_ONLY troca o cabeçalho sem mudar a política.
 */

const getClaims = vi.fn();
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getClaims } }) }));
vi.spyOn(console, 'error').mockImplementation(() => {});

const { proxy } = await import('@/proxy');

const request = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1];

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_AbCdEfGhIjKlMnOpQrStUvWx');
  vi.stubEnv('CSP_REPORT_ONLY', '');
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
  getClaims.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('CSP no proxy', () => {
  it('a resposta leva a CSP e o nonce é o mesmo da requisição que o Next lê', async () => {
    const req = request('/sessoes');
    const response = await proxy(req);
    const header = response.headers.get('content-security-policy');
    expect(header).toBeTruthy();
    expect(req.headers.get('content-security-policy')).toBe(header);
    expect(req.headers.get('x-nonce')).toBe(nonceOf(header));
    expect(header).toContain("'strict-dynamic'");
    expect(header).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('o Next recebe a CSP pelos cabeçalhos da requisição encaminhada', async () => {
    const response = await proxy(request('/sessoes'));
    const forwarded = response.headers.get('x-middleware-override-headers') ?? '';
    expect(forwarded).toContain('content-security-policy');
    expect(forwarded).toContain('x-nonce');
  });

  it('um nonce novo a cada requisição', async () => {
    const nonces = new Set<string | undefined>();
    for (let i = 0; i < 20; i++) {
      nonces.add(nonceOf((await proxy(request('/'))).headers.get('content-security-policy')));
    }
    expect(nonces.size).toBe(20);
  });

  it('um cabeçalho CSP ou x-nonce mandado pelo navegador é descartado', async () => {
    const req = new NextRequest('http://localhost:3000/', {
      headers: { 'content-security-policy': "script-src 'nonce-falso'", 'x-nonce': 'falso' },
    });
    const response = await proxy(req);
    const header = response.headers.get('content-security-policy');
    expect(header).not.toContain('nonce-falso');
    expect(req.headers.get('x-nonce')).not.toBe('falso');
    expect(req.headers.get('x-nonce')).toBe(nonceOf(header));
  });

  it('o redirecionamento do painel ao login também leva a CSP', async () => {
    const response = await proxy(request('/painel'));
    expect(response.status).toBe(307);
    expect(response.headers.get('content-security-policy')).toContain('nonce-');
  });

  describe('caminho de falha do Auth', () => {
    beforeEach(() => {
      getClaims.mockRejectedValue(new TypeError('rede'));
    });

    it('a rota pública liberada leva a CSP, com o nonce na requisição', async () => {
      const req = request('/livros/o-livro');
      const response = await proxy(req);
      expect(response.status).toBe(200);
      const header = response.headers.get('content-security-policy');
      expect(header).toContain('nonce-');
      expect(req.headers.get('x-nonce')).toBe(nonceOf(header));
    });

    it('o 503 do painel leva a CSP', async () => {
      const response = await proxy(request('/painel/livros'));
      expect(response.status).toBe(503);
      expect(response.headers.get('content-security-policy')).toContain('nonce-');
    });
  });

  describe('CSP_REPORT_ONLY', () => {
    it('"true": só relata, com a mesma política e o nonce na requisição', async () => {
      vi.stubEnv('CSP_REPORT_ONLY', 'true');
      const req = request('/');
      const response = await proxy(req);
      expect(response.headers.get('content-security-policy')).toBeNull();
      const header = response.headers.get('content-security-policy-report-only');
      expect(header).toContain("script-src 'self' 'nonce-");
      // O Next aceita o nonce também pela versão "Report-Only" (e o x-nonce segue o mesmo).
      expect(req.headers.get('content-security-policy-report-only')).toBe(header);
      expect(req.headers.get('x-nonce')).toBe(nonceOf(header));
    });

    it('qualquer outro valor continua bloqueando', async () => {
      vi.stubEnv('CSP_REPORT_ONLY', 'false');
      const response = await proxy(request('/'));
      expect(response.headers.get('content-security-policy-report-only')).toBeNull();
      expect(response.headers.get('content-security-policy')).toBeTruthy();
    });
  });

  it('liberações por ambiente: vercel.live só em preview, Turnstile só com a chave', async () => {
    const prod = (await proxy(request('/'))).headers.get('content-security-policy');
    expect(prod).not.toContain('vercel.live');
    expect(prod).not.toContain('cloudflare');

    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '0x4AAAAAAAtestkey');
    const preview = (await proxy(request('/'))).headers.get('content-security-policy');
    expect(preview).toContain('https://vercel.live');
    expect(preview).toContain('https://challenges.cloudflare.com');
  });

  it('o host do Supabase vem da variável de ambiente', async () => {
    const header = (await proxy(request('/'))).headers.get('content-security-policy');
    expect(header).toContain('https://abcdefghijklmnopqrst.supabase.co');
  });

  it('variável do Supabase inválida: a CSP sai sem o host e o site segue', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'não é uma url');
    getClaims.mockRejectedValue(new Error('x'));
    const response = await proxy(request('/sessoes'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'self'");
  });
});
