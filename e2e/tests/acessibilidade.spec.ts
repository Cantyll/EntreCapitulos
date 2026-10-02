import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { createAdmin, createUser } from '../support/users';
import { WORLD, sessionPath } from '../support/world';

/** axe (WCAG 2.0 A e AA): falha com qualquer violação "serious" ou "critical". */
async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const summary = serious.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
  expect(summary, `${label}: violações de acessibilidade`).toEqual([]);
}

const PUBLIC_PAGES: [string, string][] = [
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

test.describe('acessibilidade (axe, WCAG 2.0 A e AA)', () => {
  for (const [path, label] of PUBLIC_PAGES) {
    test(`página pública: ${label} @mobile`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectNoSeriousViolations(page, path);
    });
  }

  test('404 em português', async ({ page, guard }) => {
    guard.allowStatus(404);
    await page.goto('/uma-pagina-que-nao-existe');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page, '404');
  });

  test('sessão com comentários e fita de capítulos, com progresso escolhido', async ({ page }) => {
    await page.goto(sessionPath(WORLD.readingSlug, WORLD.sessions.public.number));
    await page.getByLabel('Li até o').first().selectOption({ label: 'Capítulo 1' });
    await expect(
      page.getByRole('button', { name: 'Mostrar o capítulo 2 mesmo assim' }),
    ).toBeVisible();
    await expectNoSeriousViolations(page, 'sessão com capítulos cobertos');
  });

  test('páginas de quem entrou: /boas-vindas e /conta', async ({ openAs }) => {
    const { page } = await openAs(await createUser({ name: null }));
    await page.goto('/boas-vindas');
    await expect(page.getByLabel('Como devemos chamar você nos comentários?')).toBeVisible();
    await expectNoSeriousViolations(page, '/boas-vindas');
    const { page: member } = await openAs(await createUser());
    await member.goto('/conta');
    await expect(member.getByRole('heading', { name: 'Excluir minha conta' })).toBeVisible();
    await expectNoSeriousViolations(member, '/conta');
  });

  // Uma por página: as listas do painel são grandes (o pool de teste tem centenas de linhas) e o axe leva tempo.
  for (const path of [
    '/painel',
    '/painel/livros',
    '/painel/livros/novo',
    '/painel/sessoes',
    '/painel/sessoes/nova',
    '/painel/comentarios',
  ]) {
    test(`painel: ${path}`, async ({ openAs }) => {
      test.slow();
      const { page } = await openAs(await createAdmin());
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expectNoSeriousViolations(page, path);
    });
  }
});

test.describe('alvos de toque de 44px (iPhone)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'webkit-mobile',
      'só o projeto de iPhone mede alvos de toque',
    );
  });

  /**
   * Botões, links isolados, campos e abas visíveis precisam ter 44x44px. Links no meio de um texto
   * (dentro de parágrafo) ficam de fora, como no WCAG 2.5.8: o alvo é a própria linha de texto.
   */
  async function smallTargets(page: Page) {
    return page.evaluate(() => {
      const selector =
        'a[href], button, summary, select, textarea, input:not([type=hidden]), [role=button], [role=tab], [role=switch], [role=radio]';
      const out: string[] = [];
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        if (
          style.visibility === 'hidden' ||
          style.display === 'none' ||
          box.width === 0 ||
          box.height === 0
        )
          continue;
        if (element.closest('[inert], [hidden]') || element.closest('.srOnly')) continue;
        if (element.tagName === 'A' && element.closest('p, small, li p')) continue;
        if (element.matches('a.skip, [class*="skip"]')) continue;
        if (box.width < 43.5 || box.height < 43.5) {
          const name = (element.getAttribute('aria-label') || element.textContent || '')
            .trim()
            .slice(0, 40);
          out.push(
            `${element.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`,
          );
        }
      }
      return out;
    });
  }

  for (const [path, label] of [
    ['/', 'home'],
    ['/livros/o-livro-de-azrael', 'livro'],
    [sessionPath(WORLD.readingSlug, WORLD.sessions.public.number), 'sessão'],
    ['/estante', 'estante'],
    ['/entrar', 'entrar'],
  ] as const) {
    test(`telas principais: ${label}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(await smallTargets(page), path).toEqual([]);
    });
  }

  test('conta e comentários de quem entrou', async ({ signedIn }) => {
    const { page } = await signedIn();
    await page.goto('/conta');
    await expect(page.getByRole('heading', { name: 'Excluir minha conta' })).toBeVisible();
    expect(await smallTargets(page), '/conta').toEqual([]);
    await page.goto(sessionPath(WORLD.readingSlug, WORLD.sessions.public.number));
    await expect(page.getByLabel('Seu comentário')).toBeVisible();
    expect(await smallTargets(page), 'sessão logada').toEqual([]);
  });
});
