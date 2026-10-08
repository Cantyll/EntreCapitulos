import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { createAdmin } from '../support/users';
import { WORLD, sessionPath } from '../support/world';

/*
 * Adaptação a telas (impeccable adapt): o que muda com a largura da área de conteúdo e com a altura da
 * janela. Roda nos projetos de computador; o tamanho de cada tela vem de `setViewportSize`.
 */

const SEED_BOOK = '/livros/o-livro-de-azrael';

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  expect(found, 'elemento sem caixa').not.toBeNull();
  return found!;
}

async function noHorizontalScroll(page: Page, label: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    `rolagem horizontal: ${label}`,
  ).toBe(true);
}

test.describe('adaptação a telas', () => {
  test('a fita de capítulos é só desenho; as sessões abrem pelas pílulas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const pills = page.getByRole('list', { name: 'Sessões da fita' });
    await expect(pills).toBeVisible();
    // Nenhum segmento de capítulo é link: eram alvos de 10x16px.
    await expect(page.getByRole('link', { name: /^Capítulo \d+, sessão \d+$/ })).toHaveCount(0);

    const links = pills.getByRole('link');
    expect(await links.count()).toBeGreaterThan(0);
    for (const link of await links.all()) {
      const { width, height } = await box(link);
      expect(Math.min(width, height), 'pílula da fita com menos de 24px').toBeGreaterThanOrEqual(
        24,
      );
    }
    await links.first().click();
    await expect(page).toHaveURL(new RegExp(`${SEED_BOOK}/sessoes/\\d+$`));

    // A fita compacta da lateral da sessão também.
    await page.goto(sessionPath(WORLD.readingSlug, WORLD.sessions.public.number));
    await expect(page.getByRole('list', { name: 'Sessões da fita' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Capítulo \d+, sessão \d+$/ })).toHaveCount(0);
  });

  test('Membros: cartões no iPad deitado, tabela no computador, cargos embaixo da lista', async ({
    openAs,
  }) => {
    test.slow();
    const { page } = await openAs(await createAdmin());
    const list = page.locator('[data-tour="members-table"]');
    const roles = page.locator('[data-tour="members-roles-card"]');

    // iPad deitado (com a barra lateral do painel): a lista tem uns 700px, então cartões, e os cargos embaixo.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/painel/membros');
    await expect(list.getByRole('list', { name: 'Membros do clube' })).toBeVisible();
    await expect(list.getByRole('table')).toHaveCount(0);
    let listBox = await box(list);
    expect((await box(roles)).y).toBeGreaterThanOrEqual(listBox.y + listBox.height);
    await noHorizontalScroll(page, 'membros 1024');

    // 1280: tabela, sem nome quebrado letra por letra; os cargos embaixo, lado a lado.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/painel/membros');
    await expect(list.getByRole('table')).toBeVisible();
    for (const name of await list.getByRole('table').getByRole('link').all()) {
      expect((await box(name)).height, 'nome da tabela em várias linhas').toBeLessThanOrEqual(60);
    }
    listBox = await box(list);
    expect((await box(roles)).y).toBeGreaterThanOrEqual(listBox.y + listBox.height);
    const terms = await roles.locator('dt').all();
    const tops = await Promise.all(terms.map(async (term) => Math.round((await box(term)).y)));
    expect(new Set(tops).size, 'os três cargos lado a lado').toBe(1);
    await noHorizontalScroll(page, 'membros 1280');

    // Tela larga: o painel para em 1240px, e a tabela fica com a largura toda.
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto('/painel/membros');
    await expect(list.getByRole('table')).toBeVisible();
    listBox = await box(list);
    expect(listBox.width).toBeGreaterThanOrEqual(1100);
    expect((await box(roles)).y).toBeGreaterThanOrEqual(listBox.y + listBox.height);
  });

  test('editor de sessão: no iPad deitado o texto ganha a largura toda', async ({ openAs }) => {
    test.slow();
    const { page } = await openAs(await createAdmin());
    const text = page.locator('[data-editor-root] > div').first();
    const options = page.getByRole('complementary', { name: 'Opções da sessão' });

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/painel/sessoes/nova');
    await expect(options).toBeVisible();
    const textBox = await box(text);
    expect(textBox.width).toBeGreaterThanOrEqual(600);
    expect((await box(options)).y).toBeGreaterThanOrEqual(textBox.y + textBox.height);
    await noHorizontalScroll(page, 'editor 1024');

    // Computador: as opções ao lado do texto.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/painel/sessoes/nova');
    await expect(options).toBeVisible();
    const wide = await box(text);
    expect((await box(options)).x).toBeGreaterThanOrEqual(wide.x + wide.width);
  });

  test('celular deitado: os cabeçalhos rolam junto com a página; em pé continuam fixos', async ({
    page,
    openAs,
  }) => {
    const header = page.locator('header').first();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(sessionPath(WORLD.readingSlug, WORLD.sessions.public.number));
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    await expect.poll(async () => (await box(header)).y).toBeLessThan(0);
    await noHorizontalScroll(page, 'sessão deitado');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(sessionPath(WORLD.readingSlug, WORLD.sessions.public.number));
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    await expect.poll(async () => Math.round((await box(header)).y)).toBe(0);

    const { page: panel } = await openAs(await createAdmin());
    await panel.setViewportSize({ width: 844, height: 390 });
    await panel.goto('/painel/membros');
    await panel.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    await expect
      .poll(async () => (await box(panel.locator('[data-admin-topbar]'))).y)
      .toBeLessThan(0);
  });
});
