import { expect, test } from '../support/fixtures';
import { coverPng } from '../support/png';
import { createAdmin, type TestUser } from '../support/users';

const DEFAULT_ROSE_2 = '#b04c69';

/** Valor do token no `<html>` da página atual (o tema vem do servidor, em `style`). */
const token = (page: import('@playwright/test').Page, name: string) =>
  page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(),
    name,
  );

test.describe.serial('painel: livros, capa e tema', () => {
  let admin: TestUser;
  const title = `Livro do Painel ${Date.now().toString(36)}`;

  test.beforeAll(async () => {
    admin = await createAdmin();
  });

  test('termina o livro atual, cadastra um livro com capa e começa a ler', async ({
    openAs,
    guard,
  }) => {
    // A capa vem do Supabase local (IP de loopback) e o otimizador de imagens do Next recusa esse endereço: 400.
    // Só acontece no ambiente de teste (ver "Fora da cobertura" no CLAUDE.md).
    guard.allowStatus(400);
    const { page } = await openAs(admin);

    await page.goto('/painel/livros');
    await page.getByRole('button', { name: 'Marcar livro como terminado' }).click();
    await page.getByLabel('Nota do livro').selectOption({ label: '4,0 de 5' });
    await page.getByRole('button', { name: 'Marcar como terminado' }).click();
    await expect(page.getByRole('region', { name: 'Leitura atual' })).not.toContainText(
      'O Livro de Azrael',
    );

    await page.goto('/painel/livros/novo');
    await page.getByLabel('Título', { exact: true }).fill(title);
    await page.getByLabel('Autor').fill('Autora do Painel');
    await page.getByLabel('Sinopse').fill('Sinopse de teste do painel.');
    await page.getByLabel('Total de capítulos').fill('12');
    await page.getByLabel('Estado inicial').selectOption('queued');
    await page
      .getByLabel('Capa')
      .setInputFiles({ name: 'capa.png', mimeType: 'image/png', buffer: await coverPng() });
    await expect(page.getByAltText('Prévia da capa escolhida')).toBeVisible();
    await page.getByRole('button', { name: 'Criar livro' }).click();
    // Só segue depois de o servidor criar o livro (e enviar a capa): a tela sai do formulário.
    await expect(page).not.toHaveURL(/\/painel\/livros\/novo/);

    await page.goto('/painel/livros');
    await page.getByRole('button', { name: `Começar a ler ${title}` }).click();
    await expect(page.getByRole('region', { name: 'Leitura atual' })).toContainText(title);
  });

  test('o tema da capa vale no site e no painel e some ao desligar o tema automático', async ({
    openAs,
    browser,
    guard,
  }) => {
    // O otimizador de imagens do Next recusa a capa do Supabase local (IP de loopback): 400, só nos testes.
    guard.allowStatus(400);
    const { page } = await openAs(admin);
    const visitor = await (await browser.newContext()).newPage();

    await visitor.goto('/');
    expect(await token(visitor, '--rose-2')).not.toBe(DEFAULT_ROSE_2);
    await page.goto('/painel/livros');
    expect(await token(page, '--rose-2')).not.toBe(DEFAULT_ROSE_2);

    await page.getByRole('switch', { name: 'Tema automático pela capa' }).click();
    await expect(page.getByRole('switch', { name: 'Tema automático pela capa' })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    await visitor.goto('/');
    await expect.poll(() => token(visitor, '--rose-2')).toBe(DEFAULT_ROSE_2);
    await page.goto('/painel/livros');
    expect(await token(page, '--rose-2')).toBe(DEFAULT_ROSE_2);
    await visitor.context().close();
  });
});
