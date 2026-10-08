import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { createAdmin, createModerator, createUser } from '../support/users';
import { WORLD, sessionPath } from '../support/world';

/**
 * axe (WCAG 2.0, 2.1 e 2.2, A e AA): falha com qualquer violação "serious" ou "critical". O 2.2 traz o
 * `target-size` (2.5.8, alvo de 24px no mouse), que pegou os segmentos de 10x16px da fita de capítulos.
 */
async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
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

test.describe('acessibilidade (axe, WCAG 2.2 A e AA)', () => {
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
    '/painel/membros',
    '/painel/sobre',
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

// `@mobile` no nome do grupo: o projeto `webkit-mobile` só roda o que tem a marca (antes da etapa 8k o grupo não
// tinha e nunca rodava em projeto nenhum).
test.describe('alvos de toque de 44px (iPhone) @mobile', () => {
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
        // O alvo real, quando não é a caixa do próprio elemento (WCAG 2.5.8 mede a área que recebe o toque):
        //  - rádio e caixa de seleção: o rótulo inteiro aciona;
        //  - campo visualmente oculto (1x1, como o de arquivo): quem recebe o toque é o rótulo visível;
        //  - link "esticado" (`::after` absoluto cobrindo o cartão): a área é o cartão.
        let target = box;
        const input = element instanceof HTMLInputElement ? element : null;
        const hiddenInput = input !== null && box.width <= 1 && box.height <= 1;
        if (
          input &&
          input.labels &&
          input.labels.length > 0 &&
          (input.type === 'radio' || input.type === 'checkbox' || hiddenInput)
        ) {
          target = input.labels[0]!.getBoundingClientRect();
        } else if (hiddenInput) {
          // Sem rótulo: quem recebe o toque é o botão visível que abre o campo, conferido à parte.
          continue;
        } else {
          const after = getComputedStyle(element, '::after');
          const holder = element.offsetParent;
          if (after.content !== 'none' && after.position === 'absolute' && holder) {
            target = holder.getBoundingClientRect();
          }
        }
        if (target.width < 43.5 || target.height < 43.5) {
          const name = (element.getAttribute('aria-label') || element.textContent || '')
            .trim()
            .slice(0, 40);
          out.push(
            `${element.tagName.toLowerCase()} "${name}" ${Math.round(target.width)}x${Math.round(target.height)}`,
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
    ['/privacidade', 'privacidade'],
    ['/termos', 'termos'],
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

  // Painel da administração: uma tela por teste (as listas do pool de teste são grandes).
  for (const path of [
    '/painel',
    '/painel/livros',
    '/painel/livros/novo',
    '/painel/sessoes',
    '/painel/sessoes/nova',
    '/painel/comentarios',
    '/painel/membros',
    '/painel/sobre',
  ]) {
    test(`painel: ${path}`, async ({ openAs }) => {
      test.slow();
      const { page } = await openAs(await createAdmin());
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await smallTargets(page), path).toEqual([]);
    });
  }

  test('painel: perfil de outra pessoa e a folha "Mais"', async ({ openAs }) => {
    test.slow();
    const member = await createUser();
    const { page } = await openAs(await createAdmin());
    await page.goto(`/painel/membros/${member.id}`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    expect(await smallTargets(page), 'perfil de membro').toEqual([]);
    await page.getByRole('button', { name: 'Mais' }).click();
    await expect(page.getByRole('dialog', { name: 'Mais' })).toBeVisible();
    expect(await smallTargets(page), 'folha Mais').toEqual([]);
  });

  test('tutorial do painel: menu do "?" e cartão do passo', async ({ openAs }) => {
    const { page } = await openAs(await createAdmin());
    await page.goto('/painel/membros');
    const help = page.getByRole('button', { name: 'Ajuda e tutorial' });
    await expect(help).toBeVisible();
    expect(await smallTargets(page), 'botão "?"').toEqual([]);
    await help.click();
    await expect(page.locator('dialog[data-tour-menu]')).toBeVisible();
    expect(await smallTargets(page), 'menu do "?"').toEqual([]);
    await page.getByRole('button', { name: 'Ajuda desta tela' }).click();
    await expect(page.locator('[data-tour-card]')).toBeVisible();
    expect(await smallTargets(page), 'cartão do tutorial').toEqual([]);
  });

  test('painel da moderação: comentários', async ({ openAs }) => {
    const { page } = await openAs(await createModerator());
    await page.goto('/painel/comentarios');
    await expect(page.locator('main')).toBeVisible();
    expect(await smallTargets(page), 'moderação').toEqual([]);
  });
});

// Campo com fonte abaixo de 16px faz o Safari do iPhone dar zoom ao focar (CLAUDE.md, bloco PWA, item 2). O
// seletor de ordem dos comentários tinha 14px até o adapt.
test.describe('campos com 16px ou mais no toque (iPhone) @mobile', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-mobile', 'só o projeto de iPhone mede os campos');
  });

  async function smallFields(page: Page) {
    return page.evaluate(() => {
      const selector =
        'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea, [contenteditable="true"]';
      const out: string[] = [];
      for (const field of document.querySelectorAll<HTMLElement>(selector)) {
        const box = field.getBoundingClientRect();
        if (box.width < 2 || box.height < 2 || field.closest('[inert], [hidden]')) continue;
        const size = Number.parseFloat(getComputedStyle(field).fontSize);
        if (size < 16) out.push(`${field.tagName.toLowerCase()}#${field.id} ${size}px`);
      }
      return out;
    });
  }

  /** Uma página nova por tela: no Chromium que imita o iPhone, a 2ª navegação na mesma aba perde o `pointer: coarse`. */
  async function expectFieldsAt(
    context: BrowserContext,
    path: string,
    ready: (page: Page) => Promise<void>,
  ) {
    const page = await context.newPage();
    await page.goto(path);
    await ready(page);
    expect(await smallFields(page), path).toEqual([]);
    await page.close();
  }

  test('site: entrar, sessão com comentários e conta', async ({ page, signedIn }) => {
    await page.goto('/entrar');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await smallFields(page), '/entrar').toEqual([]);

    const { context } = await signedIn();
    await expectFieldsAt(
      context,
      sessionPath(WORLD.readingSlug, WORLD.sessions.public.number),
      async (p) => {
        await expect(p.getByLabel('Seu comentário')).toBeVisible();
        await expect(p.getByLabel('Ordenar comentários')).toBeVisible();
      },
    );
    await expectFieldsAt(context, '/conta', async (p) => {
      await expect(p.getByRole('heading', { name: 'Excluir minha conta' })).toBeVisible();
    });
  });

  test('painel: editor, livros, membros, comentários e Página Sobre', async ({ openAs }) => {
    test.slow();
    const { context } = await openAs(await createAdmin());
    for (const path of [
      '/painel/sessoes/nova',
      '/painel/livros/novo',
      '/painel/membros',
      '/painel/comentarios',
      '/painel/sobre',
    ]) {
      await expectFieldsAt(context, path, async (p) => {
        await expect(p.locator('main')).toBeVisible();
      });
    }
  });
});
