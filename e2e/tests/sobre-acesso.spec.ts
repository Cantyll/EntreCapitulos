import { expect, test } from '../support/fixtures';
import { untilHydrated } from '../support/hydration';
import { createAdmin, createModerator, createUser } from '../support/users';

/*
 * Acesso à edição da página Sobre (etapa 8j): só a administração. A moderação e os membros recebem 403 (sem tocar em
 * nada); o visitante é mandado para o login; e `/sobre` continua pública para todos. Nenhum destes testes muda o
 * conteúdo publicado, então rodam em paralelo com os outros.
 */

test.describe('quem pode editar a página Sobre', () => {
  test('a moderação recebe 403 em /painel/sobre', async ({ openAs, guard }) => {
    guard.allowStatus(403);
    const { page } = await openAs(await createModerator());
    const response = await page.goto('/painel/sobre');
    expect(response?.status()).toBe(403);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Você não tem acesso a esta página' }),
    ).toBeVisible();
    // Nada do editor aparece.
    await expect(page.locator('[data-editor-root]')).toHaveCount(0);
    await expect(page.getByLabel('Título da página')).toHaveCount(0);
  });

  test('um membro recebe 403 em /painel/sobre', async ({ openAs, guard }) => {
    guard.allowStatus(403);
    const { page } = await openAs(await createUser());
    const response = await page.goto('/painel/sobre');
    expect(response?.status()).toBe(403);
    await expect(page.locator('[data-editor-root]')).toHaveCount(0);
  });

  test('o visitante é mandado para o login (e volta para o editor depois de entrar)', async ({
    page,
  }) => {
    await page.goto('/painel/sobre');
    await expect(page).toHaveURL(/\/entrar\?next=%2Fpainel%2Fsobre/);
  });

  test('a administração abre o editor e o item do menu leva até ele', async ({
    openAs,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'webkit-mobile', 'o menu lateral é só das telas largas');
    const { page } = await openAs(await createAdmin());
    await page.goto('/painel');
    await page
      .getByRole('navigation', { name: 'Painel' })
      .getByRole('link', { name: 'Página Sobre' })
      .click();
    await expect(page).toHaveURL(/\/painel\/sobre$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Página Sobre' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Página Sobre' }).first()).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('iPhone: o editor tem campos de 16px, alvos de 44px e nenhuma rolagem horizontal @mobile', async ({
    openAs,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'webkit-mobile',
      'só o projeto de iPhone mede alvos de toque',
    );
    const { page } = await openAs(await createAdmin());
    await page.goto('/painel/sobre');
    await expect(page.locator('[data-editor-root]')).toBeVisible();
    // Sem esperar a hidratação o clique se perde e o teste mediria só o formulário inicial.
    await untilHydrated(page.getByLabel('Título da página'));
    // Uma seção e um link abertos: os campos de todos os tipos aparecem (a foto só tem o campo de texto alternativo
    // depois de um envio, medido pelo teste da foto).
    await page.getByRole('button', { name: 'Adicionar seção' }).click();
    await page.getByRole('button', { name: 'Adicionar link' }).click();
    await expect(page.getByLabel('Título da seção 1')).toBeVisible();
    await expect(page.getByLabel('Endereço do link 1')).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Texto da seção 1/ })).toBeVisible();

    const problems = await page.evaluate(() => {
      const out: string[] = [];
      const root = document.querySelector('[data-editor-root]')!;
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
      };
      const name = (element: Element) =>
        (element.getAttribute('aria-label') || element.textContent || element.tagName)
          .trim()
          .slice(0, 40);
      for (const element of root.querySelectorAll('input[type="text"], textarea')) {
        if (!visible(element)) continue;
        const size = parseFloat(getComputedStyle(element).fontSize);
        if (size < 16) out.push(`campo ${name(element)}: ${size}px`);
      }
      const targets = 'button, [role="tab"], [role="switch"], a[href], [role="textbox"]';
      for (const element of root.querySelectorAll(targets)) {
        if (!visible(element) || element.closest('[inert]')) continue;
        const rect = element.getBoundingClientRect();
        const isTextbox = element.getAttribute('role') === 'textbox';
        if (rect.height < 43.5 || (!isTextbox && rect.width < 43.5)) {
          out.push(`alvo ${name(element)}: ${Math.round(rect.width)}x${Math.round(rect.height)}`);
        }
      }
      // Prova de cobertura: o que foi medido inclui campos, botões e as caixas de texto rico.
      out.push(
        ...(root.querySelectorAll('input[type="text"], textarea').length >= 5
          ? []
          : ['poucos campos']),
        ...(root.querySelectorAll('[role="textbox"]').length >= 2
          ? []
          : ['sem caixas de texto rico']),
        ...(root.querySelectorAll('button').length >= 10 ? [] : ['poucos botões']),
      );
      return out;
    });
    expect(problems).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test('/sobre é pública: o visitante abre sem entrar, e a moderação e os membros também', async ({
    page,
    openAs,
  }) => {
    await page.goto('/sobre');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const user of [await createModerator(), await createUser()]) {
      const opened = await openAs(user);
      await opened.page.goto('/sobre');
      await expect(opened.page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});
