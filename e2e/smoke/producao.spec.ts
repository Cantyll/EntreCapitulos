import type { APIRequestContext } from '@playwright/test';

import { expect, test } from '../support/fixtures';

/**
 * Só leitura: nenhuma requisição aqui cria, muda ou apaga algo. `/livro` e `/estante` fazem o site
 * ler do banco (o que ajuda, sem garantir, a evitar a pausa por inatividade do plano gratuito do Supabase).
 */
const PUBLIC_PAGES = ['/', '/sobre', '/estante', '/sessoes', '/privacidade', '/termos', '/entrar'];

async function headersOf(request: APIRequestContext, path: string) {
  const response = await request.get(path, { maxRedirects: 0 });
  return { response, headers: response.headers() };
}

test.describe('produção (somente leitura)', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} responde 200, sem erro de console nem violação de CSP`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });
  }

  test('o livro atual lê do banco: /livro leva à página do livro', async ({ page }) => {
    const response = await page.goto('/livro');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/livros\/[a-z0-9-]+$/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('cabeçalhos de segurança presentes em páginas públicas', async ({ request }) => {
    for (const path of ['/', '/estante', '/entrar']) {
      const { headers } = await headersOf(request, path);
      expect(headers['x-content-type-options'], path).toBe('nosniff');
      expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
      expect(headers['x-frame-options'], path).toBe('DENY');
      expect(headers['permissions-policy'], path).toContain('camera=()');
      expect(headers['strict-transport-security'], path).toMatch(/max-age=\d+/);
      // `CSP_REPORT_ONLY=true` (válvula de escape do README) troca o nome do cabeçalho: aceita os dois.
      const csp =
        headers['content-security-policy'] ?? headers['content-security-policy-report-only'] ?? '';
      expect(csp, path).toMatch(/script-src[^;]*'nonce-/);
      expect(csp, path).not.toContain('form-action');
    }
  });

  test('manifest e ícones', async ({ request }) => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    const json = (await manifest.json()) as { name: string; icons: { src: string }[] };
    expect(json.name).toBe('Entre Capítulos');
    for (const icon of json.icons) {
      expect((await request.get(icon.src)).status(), icon.src).toBe(200);
    }
    const html = await (await request.get('/')).text();
    const apple = /<link rel="apple-touch-icon" href="([^"]+)"/.exec(html)?.[1];
    expect(apple).toBeTruthy();
    expect((await request.get(apple!)).status()).toBe(200);
  });

  test('robots.txt bloqueia as áreas privadas', async ({ request }) => {
    const text = await (await request.get('/robots.txt')).text();
    for (const path of ['/painel', '/conta', '/auth', '/entrar'])
      expect(text).toContain(`Disallow: ${path}`);
  });

  test('/painel sem login redireciona para /entrar', async ({ request }) => {
    const response = await request.get('/painel', { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(response.status());
    expect(response.headers()['location'] ?? '').toMatch(/\/entrar\?next=%2Fpainel/);
  });

  test('404 em português', async ({ page, guard }) => {
    guard.allowStatus(404);
    const response = await page.goto('/uma-pagina-que-nao-existe-smoke');
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Não encontramos esta página' }),
    ).toBeVisible();
  });
});
