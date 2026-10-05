import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { THEMES } from '../support/themes';
import { createAdmin, createUser } from '../support/users';
import { WORLD, sessionPath } from '../support/world';

/**
 * Contraste de cor (axe, `color-contrast`) nas páginas principais SOB TRÊS TEMAS: o rosa padrão e dois
 * derivados pelo motor a partir de capas de fixture (laranja com destaque perto de #CD7A45, e azul
 * escuro). Os tokens são injetados na raiz da página, como o layout faz com o tema do livro, sem
 * depender de upload de capa. Falha em qualquer violação serious ou critical.
 */
test.describe('contraste de cor sob vários temas', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'o contraste não depende do navegador');
  });

  async function applyTheme(page: Page, tokens: Record<string, string> | null) {
    if (!tokens) return;
    await page.evaluate((values) => {
      for (const [name, value] of Object.entries(values)) {
        document.documentElement.style.setProperty(name, value);
      }
    }, tokens);
    // O tema entrou mesmo: o destaque calculado na página é o do motor, e não o rosa padrão.
    const applied = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--rose-2').trim().toLowerCase(),
    );
    expect(applied).toBe(tokens['--rose-2']!.toLowerCase());
  }

  async function violations(page: Page) {
    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  }

  async function expectContrast(page: Page, label: string) {
    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    const bad = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .flatMap((v) =>
        v.nodes.slice(0, 4).map((n) => {
          const data = n.any[0]?.data as
            { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
          return `${n.target.join(' ')} ${data?.fgColor} sobre ${data?.bgColor} = ${data?.contrastRatio}`;
        }),
      );
    expect(bad, `${label}: contraste`).toEqual([]);
  }

  test('controle: o teste enxerga um tema ruim (texto de apoio quase invisível)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await applyTheme(page, { '--rose-2': '#b04c69', '--ink-3': '#d9cdd2', '--ink-2': '#d9cdd2' });
    expect((await violations(page)).length).toBeGreaterThan(0);
  });

  const PUBLIC: [string, string][] = [
    ['/', 'home'],
    ['/sobre', 'sobre'],
    ['/estante', 'estante'],
    ['/sessoes', 'sessões'],
    ['/livros/o-livro-de-azrael', 'livro'],
    [sessionPath(WORLD.readingSlug, WORLD.sessions.public.number), 'sessão'],
    ['/entrar', 'entrar'],
    ['/privacidade', 'privacidade'],
    ['/termos', 'termos'],
  ];
  const PANEL = [
    '/painel',
    '/painel/livros',
    '/painel/livros/novo',
    '/painel/sessoes',
    '/painel/sessoes/nova',
    '/painel/comentarios',
    '/painel/membros',
  ];

  for (const theme of THEMES) {
    test.describe(`tema ${theme.name}`, () => {
      for (const [path, label] of PUBLIC) {
        test(`público: ${label}`, async ({ page }) => {
          await page.goto(path);
          await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
          await applyTheme(page, theme.tokens);
          await expectContrast(page, `${theme.name} ${path}`);
        });
      }

      test('público: sessão com capítulo coberto e progresso escolhido', async ({ page }) => {
        await page.goto(sessionPath(WORLD.readingSlug, WORLD.sessions.public.number));
        await page.getByLabel('Li até o').first().selectOption({ label: 'Capítulo 1' });
        await expect(
          page.getByRole('button', { name: 'Mostrar o capítulo 2 mesmo assim' }),
        ).toBeVisible();
        await applyTheme(page, theme.tokens);
        await expectContrast(page, `${theme.name} sessão com cobertura`);
      });

      test('quem entrou: /boas-vindas e /conta', async ({ openAs }) => {
        const { page } = await openAs(await createUser({ name: null }));
        await page.goto('/boas-vindas');
        await expect(page.getByLabel('Como devemos chamar você nos comentários?')).toBeVisible();
        await applyTheme(page, theme.tokens);
        await expectContrast(page, `${theme.name} /boas-vindas`);
        const { page: member } = await openAs(await createUser());
        await member.goto('/conta');
        await expect(member.getByRole('heading', { name: 'Excluir minha conta' })).toBeVisible();
        await applyTheme(member, theme.tokens);
        await expectContrast(member, `${theme.name} /conta`);
      });

      test('painel: perfil de membro, com o diálogo aberto', async ({ openAs }) => {
        test.slow();
        const person = await createUser({ name: `Tema ${Date.now().toString(36)}` });
        const { page } = await openAs(await createAdmin());
        await page.goto(`/painel/membros/${person.id}`);
        await expect(page.getByRole('heading', { name: 'Cargo', exact: true })).toBeVisible();
        await applyTheme(page, theme.tokens);
        await expectContrast(page, `${theme.name} perfil de membro`);
        await page.getByLabel('Novo cargo').selectOption('admin');
        await page.getByRole('button', { name: 'Alterar cargo…' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectContrast(page, `${theme.name} perfil de membro com diálogo`);
      });

      for (const path of PANEL) {
        test(`painel: ${path}`, async ({ openAs }) => {
          test.slow();
          const { page } = await openAs(await createAdmin());
          await page.goto(path);
          await expect(page.locator('main')).toBeVisible();
          await applyTheme(page, theme.tokens);
          await expectContrast(page, `${theme.name} ${path}`);
        });
      }
    });
  }
});
