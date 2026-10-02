import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { createAdmin, createUser } from '../support/users';

/** Cabeçalhos e robots não dependem do navegador: um projeto basta (as páginas legais rodam em todos). */
test.describe('segurança de transporte e robots', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'independe do navegador');
  });

  const PUBLIC_ROUTES = [
    '/',
    '/sobre',
    '/estante',
    '/sessoes',
    '/livros/o-livro-de-azrael',
    '/livros/e2e-leitura/sessoes/1',
    '/entrar',
    '/privacidade',
    '/termos',
    '/uma-pagina-que-nao-existe',
  ];

  async function getHeaders(request: APIRequestContext, path: string) {
    const response = await request.get(path, { maxRedirects: 0 });
    return { response, headers: response.headers(), html: await response.text() };
  }

  function expectSecurityHeaders(headers: Record<string, string>, path: string) {
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(headers['x-frame-options'], path).toBe('DENY');
    expect(headers['permissions-policy'], path).toBe('camera=(), microphone=(), geolocation=()');
    const hsts = headers['strict-transport-security'] ?? '';
    expect(hsts, path).toContain('max-age=63072000');
    expect(hsts, path).not.toMatch(/includeSubDomains|preload/i);

    const csp = headers['content-security-policy'] ?? '';
    expect(csp, path).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=_-]{16,}' 'strict-dynamic'/);
    expect(csp, path).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp, path).not.toContain('form-action');
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).toContain("object-src 'none'");
    expect(csp, path).toContain("base-uri 'self'");
    expect(csp, path).toContain('upgrade-insecure-requests');
  }

  const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1] ?? '';

  test('rotas públicas: cabeçalhos presentes e nonce diferente a cada requisição', async ({
    request,
    guard,
  }) => {
    guard.allowStatus(404);
    for (const path of PUBLIC_ROUTES) {
      const first = await getHeaders(request, path);
      const second = await getHeaders(request, path);
      expectSecurityHeaders(first.headers, path);
      const nonce = nonceOf(first.headers['content-security-policy']!);
      expect(nonce, path).not.toBe(nonceOf(second.headers['content-security-policy']!));
      // Os scripts do Next saem com o MESMO nonce do cabeçalho: sem isso a página não funcionaria.
      expect(first.html, path).toContain(`nonce="${nonce}"`);
    }
  });

  test('o navegador não consegue impor a própria CSP nem o próprio nonce', async ({ request }) => {
    const response = await request.get('/', {
      headers: { 'content-security-policy': 'default-src *', 'x-nonce': 'forjado-pelo-navegador' },
    });
    const csp = response.headers()['content-security-policy'] ?? '';
    expect(csp).not.toContain('forjado-pelo-navegador');
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(await response.text()).not.toContain('forjado-pelo-navegador');
  });

  test('rotas de quem entrou: /boas-vindas, /conta e o painel (editor incluso)', async ({
    openAs,
  }) => {
    const newcomer = await createUser({ name: null });
    const { context: memberContext } = await openAs(newcomer);
    for (const path of ['/boas-vindas', '/conta', '/conta/excluida']) {
      const { headers, response } = await getHeaders(memberContext.request, path);
      expect(response.status(), path).toBeLessThan(400);
      expectSecurityHeaders(headers, path);
    }

    const { context: adminContext } = await openAs(await createAdmin());
    for (const path of [
      '/painel',
      '/painel/livros',
      '/painel/sessoes',
      '/painel/sessoes/nova',
      '/painel/comentarios',
    ]) {
      const { headers, response } = await getHeaders(adminContext.request, path);
      expect(response.status(), path).toBeLessThan(400);
      expectSecurityHeaders(headers, path);
      expect(nonceOf(headers['content-security-policy']!), path).not.toBe('');
    }
  });

  test('robots.txt bloqueia as áreas privadas e libera o resto', async ({ request }) => {
    const text = await (await request.get('/robots.txt')).text();
    expect(text).toMatch(/User-Agent: \*/i);
    expect(text).toMatch(/Allow: \//);
    for (const path of ['/painel', '/conta', '/auth', '/entrar'])
      expect(text).toContain(`Disallow: ${path}`);
    expect(text).not.toMatch(/Disallow: \/\s*$/m);
  });

  test('páginas privadas têm noindex; as públicas não', async ({ request, openAs }) => {
    const noindex = /<meta name="robots" content="[^"]*noindex/;
    expect((await getHeaders(request, '/entrar')).html).toMatch(noindex);
    expect((await getHeaders(request, '/')).html).not.toMatch(noindex);

    const { context } = await openAs(await createUser({ name: null }));
    expect((await getHeaders(context.request, '/boas-vindas')).html).toMatch(noindex);
    expect((await getHeaders(context.request, '/conta')).html).toMatch(noindex);

    const { context: adminContext } = await openAs(await createAdmin());
    expect((await getHeaders(adminContext.request, '/painel/livros')).html).toMatch(noindex);
  });
});

test.describe('páginas legais', () => {
  for (const [path, title] of [
    ['/privacidade', 'Política de Privacidade'],
    ['/termos', 'Termos de Uso'],
  ] as const) {
    test(`${path} mostra o aviso de rascunho e fica fora dos buscadores @mobile`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: new RegExp(title) })).toBeVisible();
      await expect(page.getByText('Rascunho em revisão.')).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      // A redação proibida de afirmar (ver CLAUDE.md): os dados não "ficam no Brasil" por definição.
      await expect(
        page.getByText(/não saem do Brasil|não há transferência internacional/i),
      ).toHaveCount(0);
    });
  }
});
