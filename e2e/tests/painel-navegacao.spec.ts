import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../support/fixtures';
import { createAdmin, createModerator } from '../support/users';

/**
 * Navegação do painel (etapa 8b): o menu só tem áreas que existem. Votações e Configurações
 * não aparecem nem na barra lateral nem em "Mais", mas as rotas continuam atrás do papel de
 * administração e mostram "Em breve", sem número nem nome. Membros (etapa 8f) já existe: está no
 * menu (e em "Mais", no celular) só para a administração.
 */
const SOON = [
  { path: '/painel/votacoes', title: 'Votações' },
  { path: '/painel/configuracoes', title: 'Configurações' },
];

test.describe('navegação do painel', () => {
  test('desktop: a barra lateral só tem Visão geral, Sessões, Livros, Comentários, Membros e Página Sobre', async ({
    openAs,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'webkit-mobile', 'a barra lateral é só das telas largas');
    const { page } = await openAs(await createAdmin());
    await page.goto('/painel');
    const nav = page.getByRole('navigation', { name: 'Painel' });
    await expect(nav.getByRole('link')).toHaveText([
      'Visão geral',
      'Sessões',
      'Livros',
      /^Comentários/,
      'Membros',
      'Página Sobre',
    ]);
    for (const { title } of SOON) {
      await expect(nav.getByRole('link', { name: title })).toHaveCount(0);
    }
  });

  test('a Visão geral tem atalhos reais e diz o que ainda não existe', async ({ openAs }) => {
    const { page } = await openAs(await createAdmin());
    await page.goto('/painel');
    const main = page.locator('main');
    await expect(main.getByRole('heading', { name: 'Indicadores e atividade' })).toBeVisible();
    await expect(main.getByText('Em breve')).toBeVisible();
    // Nenhum número de exemplo: o texto da página não tem dígito algum.
    expect(await main.innerText()).not.toMatch(/\d/);
    for (const name of ['Sessões', 'Livros', 'Comentários', 'Membros', 'Página Sobre']) {
      await expect(main.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    await main.getByRole('link', { name: /^Livros/ }).click();
    await expect(page).toHaveURL(/\/painel\/livros$/);
  });

  for (const { path, title } of SOON) {
    test(`${path} mostra "Em breve", sem dado inventado, e passa no axe`, async ({ openAs }) => {
      const { page } = await openAs(await createAdmin());
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.locator('main').getByText('Em breve')).toBeVisible();
      expect(await page.locator('main').innerText()).not.toMatch(/\d/);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      ).toEqual([]);
    });
  }

  test('iPhone: a moderação também tem "Mais", com Ver o site, Minha conta e Tutorial @mobile', async ({
    openAs,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-mobile', 'barra inferior é só do celular');
    const { page } = await openAs(await createModerator());
    await page.goto('/painel/comentarios');
    const bar = page.getByRole('navigation', { name: 'Painel' });
    await bar.getByRole('button', { name: 'Mais' }).click();
    const sheet = page.getByRole('dialog', { name: 'Mais' });
    await expect(sheet.getByRole('link')).toHaveText(['Ver o site', 'Minha conta']);
    await expect(sheet.getByRole('button', { name: 'Tutorial' })).toBeVisible();
  });

  test('a moderação continua indo direto para Comentários e não abre as áreas "Em breve"', async ({
    openAs,
    guard,
  }) => {
    guard.allowStatus(403);
    const { page } = await openAs(await createModerator());
    await page.goto('/painel');
    await expect(page).toHaveURL(/\/painel\/comentarios$/);
    for (const path of ['/painel/membros', '/painel/sobre', ...SOON.map((item) => item.path)]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(403);
    }
  });

  test('iPhone: a barra inferior não leva às áreas "Em breve" e "Mais" só tem Livros, Membros, Página Sobre e os atalhos @mobile', async ({
    openAs,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-mobile', 'barra inferior é só do celular');
    const { page } = await openAs(await createAdmin());
    await page.goto('/painel');
    const bar = page.getByRole('navigation', { name: 'Painel' });
    for (const { title } of SOON) {
      await expect(bar.getByRole('link', { name: title })).toHaveCount(0);
    }
    await bar.getByRole('button', { name: 'Mais' }).click();
    const sheet = page.getByRole('dialog', { name: 'Mais' });
    // Livros, Membros, Página Sobre e os atalhos "Ver o site" e "Minha conta" (que não são áreas do painel), mais o
    // botão "Tutorial" (etapa 8k), que abre o menu do "?".
    await expect(sheet.getByRole('link')).toHaveText([
      'Livros',
      'Membros',
      'Página Sobre',
      'Ver o site',
      'Minha conta',
    ]);
    await expect(sheet.getByRole('button', { name: 'Tutorial' })).toBeVisible();
  });
});
