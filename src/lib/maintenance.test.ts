import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isMaintenanceMode, maintenanceResponse } from './maintenance';

/*
 * Standby: com MAINTENANCE_MODE=true o proxy responde a página de pausa em toda rota e NUNCA fala com o
 * Supabase (o banco pode estar pausado). Sem a variável, nada muda.
 */

const getClaims = vi.fn();
const createServerClient = vi.fn((..._args: unknown[]) => ({ auth: { getClaims } }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}));

const { proxy } = await import('@/proxy');

const request = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const passes = (response: Response) => response.headers.get('x-middleware-next') === '1';

describe('isMaintenanceMode', () => {
  it.each(['true', 'TRUE', ' True ', 'true\n'])('liga com %j', (value) => {
    expect(isMaintenanceMode(value)).toBe(true);
  });

  it.each([undefined, '', 'false', '1', 'yes', 'on', 'truee'])('não liga com %j', (value) => {
    expect(isMaintenanceMode(value)).toBe(false);
  });
});

describe('maintenanceResponse', () => {
  it('é um 503 em pt-BR, sem cache, que pede para voltar depois e não deixa indexar', async () => {
    const response = maintenanceResponse();
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('86400');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    const html = await response.text();
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain('Estamos em uma pausa');
    expect(html).toContain('name="viewport"');
  });

  it('é autônoma: sem script, sem recurso externo e sem promessa de data', async () => {
    const html = await maintenanceResponse().text();
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(?:src|href)=["']?(?:https?:)?\/\//i);
    expect(html).not.toMatch(/@import|url\(/i);
    expect(html).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}|em breve/i);
  });
});

describe('proxy em modo de manutenção', () => {
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

  it.each([
    '/',
    '/sessoes',
    '/livros/o-livro-de-azrael',
    '/entrar',
    '/auth/callback',
    '/painel',
    '/painel/livros',
    '/conta/dados',
  ])('responde a página de pausa em %s, sem consultar o Supabase', async (path) => {
    vi.stubEnv('MAINTENANCE_MODE', 'true');
    const response = await proxy(request(path));
    expect(response.status).toBe(503);
    expect(passes(response)).toBe(false);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toContain('Estamos em uma pausa');
    expect(createServerClient).not.toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
  });

  it('a resposta leva a CSP', async () => {
    vi.stubEnv('MAINTENANCE_MODE', 'true');
    const response = await proxy(request('/'));
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('sem a variável (ou com outro valor) o site funciona como sempre', async () => {
    for (const value of ['', 'false']) {
      vi.stubEnv('MAINTENANCE_MODE', value);
      const response = await proxy(request('/sessoes'));
      expect(passes(response)).toBe(true);
      expect(response.status).toBe(200);
    }
    expect(getClaims).toHaveBeenCalled();
  });
});
