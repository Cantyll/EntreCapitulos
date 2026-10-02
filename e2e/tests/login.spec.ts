import type { Page } from '@playwright/test';

import { sql, lit } from '../support/db';
import { expect, test } from '../support/fixtures';
import { codeFor } from '../support/mail';
import { createUser, uniqueEmail } from '../support/users';

/** Pede o código no formulário e confirma com o código que chegou ao Mailpit. */
async function enterWithCode(page: Page, email: string) {
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Receber código por e-mail' }).click();
  const field = page.getByLabel(/Código de 6 dígitos/);
  await expect(field).toBeVisible();
  await field.fill(await codeFor(email));
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('login por código', () => {
  test('e-mail, código, nome em /boas-vindas, nome no cabeçalho sem recarregar e sair @mobile', async ({
    page,
  }) => {
    const email = uniqueEmail('nova');
    await page.goto('/entrar');
    await expect(page.getByRole('link', { name: 'Termos' }).first()).toBeVisible();
    await enterWithCode(page, email);

    await expect(page).toHaveURL(/\/boas-vindas$/);
    await expect(page.getByLabel('Como devemos chamar você nos comentários?')).toBeVisible();
    // Marca a página: se o cabeçalho mudar sem esta marca sumir, não houve recarga completa.
    await page.evaluate(() => {
      (window as unknown as { __semRecarga: boolean }).__semRecarga = true;
    });
    await page.getByLabel('Como devemos chamar você nos comentários?').fill('Leitora Nova');
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page).toHaveURL(/\/$/);
    const menu = page.getByRole('button', { name: 'Menu da conta de Leitora Nova' });
    await expect(menu).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __semRecarga?: boolean }).__semRecarga),
    ).toBe(true);

    // O banco guarda só o nome público (nenhum trecho do e-mail).
    expect(
      sql(
        `select p.display_name from public.profiles p join auth.users u on u.id = p.id where u.email = ${lit(email)};`,
      ),
    ).toBe('Leitora Nova');

    await menu.click();
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('link', { name: 'Entrar' }).first()).toBeVisible();
    await expect(menu).toHaveCount(0);
  });

  test('visitante em /painel vai para /entrar?next= e o membro recebe 403 @mobile', async ({
    page,
    openAs,
    guard,
  }) => {
    guard.allowStatus(403);
    await page.goto('/painel/livros');
    await expect(page).toHaveURL(/\/entrar\?next=%2Fpainel%2Flivros$/);

    const { page: member } = await openAs(await createUser());
    const response = await member.goto('/painel/livros');
    expect(response?.status()).toBe(403);
    await expect(
      member.getByRole('heading', { level: 1, name: 'Você não tem acesso a esta página' }),
    ).toBeVisible();
  });

  const malicious = [
    ['//evil.com', '//evil.com'],
    ['https://evil.com', 'https://evil.com'],
    ['/\\evil.com', '/\\evil.com'],
  ] as const;

  for (const [label, value] of malicious) {
    test(`next malicioso (${label}) cai em "/"`, async ({ page }) => {
      const user = await createUser();
      await page.goto(`/entrar?next=${encodeURIComponent(value)}`);
      await enterWithCode(page, user.email);
      await expect(
        page.getByRole('button', { name: `Menu da conta de ${user.name}` }),
      ).toBeVisible();
      const url = new URL(page.url());
      expect(url.origin).toBe('https://localhost:3443');
      expect(url.pathname).toBe('/');
    });
  }

  test('next válido leva de volta à página pedida', async ({ page }) => {
    const user = await createUser();
    await page.goto(`/entrar?next=${encodeURIComponent('/estante')}`);
    await enterWithCode(page, user.email);
    await expect(page).toHaveURL(/\/estante$/);
  });
});
