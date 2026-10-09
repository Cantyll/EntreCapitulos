import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

import { TOUR_STEPS } from '../../src/content/tour/steps';
import { TOUR_VERSION } from '../../src/content/tour/version';
import { lit, sqlNumber } from '../support/db';
import { expect, test } from '../support/fixtures';
import { untilHydrated } from '../support/hydration';
import { untilMotionSettles } from '../support/motion';
import { createAdmin, createModerator } from '../support/users';

/*
 * Tutorial guiado do painel (etapa 8k). O tutorial nunca cria, edita, publica, aprova, suspende nem apaga nada: os
 * testes conferem também que nada mudou no banco. As contas da equipe nascem com o tutorial "já visto"
 * (`markTutorialSeen`); aqui se usa `tutorial: 'unseen'` quando o teste precisa do cartão de boas-vindas.
 */

const STEP_BY_ID = new Map(TOUR_STEPS.map((step) => [step.id, step]));
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** As telas do painel da administração (fora a Visão geral). */
const PANEL_ROUTES = [
  '/painel/livros',
  '/painel/livros/novo',
  '/painel/sessoes',
  '/painel/sessoes/nova',
  '/painel/comentarios',
  '/painel/membros',
  '/painel/sobre',
  '/painel/votacoes',
  '/painel/configuracoes',
];

const helpButton = (page: Page) => page.getByRole('button', { name: 'Ajuda e tutorial' });
const card = (page: Page) => page.locator('[data-tour-card]');
const welcome = (page: Page) => page.locator('[data-tour-welcome]');
const menu = (page: Page) => page.locator('dialog[data-tour-menu]');

function seenVersion(id: string): number {
  return sqlNumber(`select tour_seen_version from public.profiles where id = ${lit(id)};`);
}

/**
 * O navegador às vezes pede `/favicon.ico` sozinho e o site (que serve o ícone por `/icon`) responde 404: ruído antigo
 * que o `guard` registra como `console.error`. Respondido com 204 aqui, como em `termos-aceite.spec.ts`.
 */
async function quietFavicon(page: Page) {
  await page.context().route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
}

async function openPanel(page: Page, path: string) {
  await quietFavicon(page);
  await page.goto(path);
  await untilHydrated(helpButton(page));
}

async function openMenu(page: Page) {
  await helpButton(page).click();
  await expect(menu(page)).toBeVisible();
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Primeiro elemento visível com o `data-tour` do passo. */
async function visibleTarget(page: Page, name: string): Promise<Locator | null> {
  const all = page.locator(`[data-tour="${name}"]`);
  const count = await all.count();
  for (let i = 0; i < count; i++) {
    if (await all.nth(i).isVisible()) return all.nth(i);
  }
  return null;
}

/**
 * Onde o cartão está em relação ao alvo: `ok`, `cobre` ou `fora` (o alvo não aparece na tela). Vale para o balão, a
 * folha do celular e o canto do computador. Quando o alvo e o cartão não cabem juntos na tela (uma lista inteira; no
 * celular deitado, quase qualquer bloco, com o cabeçalho e a barra de baixo), basta o começo do alvo (os primeiros
 * 44px) ficar à vista e descoberto.
 */
function coverage(
  card: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number },
  viewportHeight: number,
): 'ok' | 'cobre' | 'fora' {
  const visibleTop = Math.max(target.y, 0);
  const visibleBottom = Math.min(target.y + target.height, viewportHeight);
  if (visibleBottom - visibleTop < Math.min(24, target.height)) return 'fora';
  if (!intersects(card, target)) return 'ok';
  // Folga para o cabeçalho e a barra de baixo, que também ocupam a tela.
  const bothFit = target.height + card.height <= viewportHeight - 140;
  if (bothFit) return 'cobre';
  const start = { x: target.x, y: visibleTop, width: target.width, height: 44 };
  return target.y >= -1 && !intersects(card, start) ? 'ok' : 'cobre';
}

/**
 * O passo atual "assentou" (alvo achado, ou cartão centralizado) e o cartão está dentro da janela, sem cobrir o alvo
 * (o alvo do passo ou, no celular, o substituto). Devolve o id do passo.
 */
async function checkStep(page: Page): Promise<string> {
  await expect(card(page)).toBeVisible();
  const id = (await card(page).getAttribute('data-tour-step'))!;
  const step = STEP_BY_ID.get(id)!;
  if (step.target) {
    await expect
      .poll(
        async () =>
          (await page.locator('[data-tour-ring]').count()) > 0 ||
          (await card(page).getAttribute('data-tour-missing')) !== null,
        { message: `${id}: o alvo não apareceu nem virou cartão centralizado`, timeout: 10_000 },
      )
      .toBe(true);
  }
  const viewport = page.viewportSize()!;
  await expect
    .poll(
      async () => {
        const box = await card(page).boundingBox();
        return (
          box !== null &&
          box.x >= -1 &&
          box.y >= -1 &&
          box.x + box.width <= viewport.width + 1 &&
          box.y + box.height <= viewport.height + 1
        );
      },
      { message: `${id}: o cartão saiu da janela` },
    )
    .toBe(true);

  // Não cobre o alvo, qualquer que seja o desenho do cartão. No computador a rolagem é suave: espera assentar.
  if (step.target) {
    const target =
      (await visibleTarget(page, step.target)) ??
      (step.altTarget ? await visibleTarget(page, step.altTarget) : null);
    if (target) {
      await expect
        .poll(
          async () => {
            const [a, b] = await Promise.all([card(page).boundingBox(), target.boundingBox()]);
            return a && b ? coverage(a, b, viewport.height) : 'fora';
          },
          { message: `${id}: o cartão cobre o alvo ou o alvo ficou fora da tela` },
        )
        .toBe('ok');
    }
  }
  return id;
}

/** Percorre até o fim, sempre por "Próximo"/"Concluir". Devolve os ids dos passos vistos. */
async function walk(page: Page, max = 120): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < max; i++) {
    const id = await checkStep(page);
    if (seen.at(-1) !== id) seen.push(id);
    const finish = card(page).getByRole('button', { name: 'Concluir', exact: true });
    if (await finish.isVisible()) {
      await finish.click();
      await expect(card(page)).toHaveCount(0);
      return seen;
    }
    await card(page).getByRole('button', { name: 'Próximo', exact: true }).click();
    await expect(card(page)).not.toHaveAttribute('data-tour-step', id);
  }
  throw new Error('o tour não terminou');
}

/** Contagens que o tutorial não pode mudar (nada criado, publicado nem auditado por quem fez o tour). */
function untouched(adminId: string, since: string) {
  return {
    books: sqlNumber(`select count(*) from public.books where created_at >= ${lit(since)};`),
    sessions: sqlNumber(
      `select count(*) from public.reading_sessions where created_at >= ${lit(since)};`,
    ),
    drafts: sqlNumber(
      `select count(*) from public.site_page_drafts where updated_at >= ${lit(since)};`,
    ),
    audit: sqlNumber(`select count(*) from public.member_audit where actor_id = ${lit(adminId)};`),
  };
}

test.describe('tutorial do painel', () => {
  test('primeira visita: cartão no fluxo; "Agora não" grava e mostra a dica de uma vez só @mobile', async ({
    openAs,
  }) => {
    const admin = await createAdmin({ tutorial: 'unseen' });
    const { page } = await openAs(admin);
    await openPanel(page, '/painel');
    await expect(welcome(page)).toBeVisible();
    await expect(
      welcome(page).getByRole('heading', { name: 'Quer um tour rápido?' }),
    ).toBeVisible();
    // Não é modal: nada mais fica inerte e o cartão de instalação espera (ordem: Termos, tour, instalação).
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('[data-install-card]')).toHaveCount(0);

    await welcome(page).getByRole('button', { name: 'Agora não' }).click();
    await expect(welcome(page)).toHaveCount(0);
    const hint = page.locator('[data-tour-hint="review"]');
    await expect(hint).toContainText('Você pode rever o tutorial aqui quando quiser.');
    await expect(hint.getByRole('button', { name: 'Entendi' })).toBeFocused();
    await expect.poll(() => seenVersion(admin.id)).toBe(TOUR_VERSION);
    await hint.getByRole('button', { name: 'Entendi' }).click();
    await expect(hint).toHaveCount(0);
    await expect(helpButton(page)).toBeFocused();

    await page.reload();
    await untilHydrated(helpButton(page));
    await expect(welcome(page)).toHaveCount(0);
    await expect(page.locator('[data-tour-hint]')).toHaveCount(0);
  });

  test('com o aviso dos Termos na tela, o cartão do tour espera', async ({ openAs }) => {
    const admin = await createAdmin({ tutorial: 'unseen', terms: false });
    const { page } = await openAs(admin);
    await openPanel(page, '/painel');
    await expect(page.getByRole('region', { name: 'Aviso sobre os Termos' })).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
    await expect(page.locator('[data-install-card]')).toHaveCount(0);
  });

  test('tour completo da administração: todos os capítulos, na tela, sem cobrir o alvo e sem mudar nada @mobile', async ({
    openAs,
  }) => {
    test.slow();
    const admin = await createAdmin({ tutorial: 'unseen' });
    const since = new Date().toISOString();
    const before = untouched(admin.id, since);
    const { page } = await openAs(admin);
    await openPanel(page, '/painel');
    await welcome(page).getByRole('button', { name: 'Começar' }).click();
    const ids = await walk(page);

    const chapters = [...new Set(ids.map((id) => STEP_BY_ID.get(id)!.chapter))];
    expect(chapters).toEqual([
      'navegacao',
      'livros',
      'sessoes',
      'editor',
      'publicar',
      'comentarios',
      'membros',
      'sobre',
      'leitoras',
      'conta',
    ]);
    expect(STEP_BY_ID.get(ids.at(-1)!)!.target).toBe('help-button');
    // Concluir: a dica aparece, a versão fica gravada e o cartão de boas-vindas não volta.
    await expect(page.locator('[data-tour-hint="review"]')).toBeVisible();
    expect(seenVersion(admin.id)).toBe(TOUR_VERSION);
    expect(untouched(admin.id, since)).toEqual(before);
    await page.goto('/painel');
    await untilHydrated(helpButton(page));
    await expect(welcome(page)).toHaveCount(0);
  });

  test('tour da moderação: só Comentários e Conta, e o último passo aponta o "?" @mobile', async ({
    openAs,
  }) => {
    test.slow();
    const moderator = await createModerator({ tutorial: 'unseen' });
    const { page } = await openAs(moderator);
    await openPanel(page, '/painel/comentarios');
    await welcome(page).getByRole('button', { name: 'Começar' }).click();
    const ids = await walk(page);
    const chapters = [...new Set(ids.map((id) => STEP_BY_ID.get(id)!.chapter))];
    expect(chapters).toEqual(['comentarios', 'conta']);
    expect(STEP_BY_ID.get(ids.at(-1)!)!.target).toBe('help-button');
    await expect(page).toHaveURL(/\/painel\/comentarios/);
    expect(seenVersion(moderator.id)).toBe(TOUR_VERSION);
  });

  test('celular deitado: o tour completo fica na tela, sem cobrir o alvo @mobile', async ({
    openAs,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'webkit-mobile',
      'só o iPhone tem o desenho do celular deitado',
    );
    test.slow();
    const { page } = await openAs(await createAdmin());
    await page.setViewportSize({ width: 844, height: 390 });
    await openPanel(page, '/painel');
    await openMenu(page);
    await menu(page).getByRole('button', { name: 'Tour completo' }).click();
    const ids = await walk(page);
    expect(STEP_BY_ID.get(ids.at(-1)!)!.target).toBe('help-button');
  });

  test('celular: os elementos presos embaixo ganham o balão ACIMA deles @mobile', async ({
    openAs,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-mobile', 'a barra de baixo só existe no celular');
    const { page } = await openAs(await createAdmin());
    await openPanel(page, '/painel');
    await openMenu(page);
    await menu(page).getByRole('button', { name: 'Tour completo' }).click();
    await card(page).getByRole('button', { name: 'Próximo', exact: true }).click();
    // nav-menu: a barra de baixo do painel continua visível, com o balão acima dela.
    await expect(card(page)).toHaveAttribute('data-tour-step', 'nav-menu');
    await expect(card(page)).toHaveAttribute('data-tour-placement', 'anchored');
    await expect(card(page)).toHaveAttribute('data-tour-side', 'above');
    await checkStep(page);
  });

  test('"?": menu, Esc e foco; a moderação só vê os capítulos dela', async ({ openAs }) => {
    const { page } = await openAs(await createAdmin());
    await openPanel(page, '/painel');
    await openMenu(page);
    await expect(helpButton(page)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(helpButton(page)).toBeFocused();
    await expect(helpButton(page)).toHaveAttribute('aria-expanded', 'false');
    await openMenu(page);
    await menu(page).getByRole('button', { name: 'Escolher um capítulo' }).click();
    await expect(menu(page).getByRole('button', { name: /^\d+\. / })).toHaveCount(10);
    await menu(page).getByRole('button', { name: 'Fechar' }).click();

    const { page: mod } = await openAs(await createModerator());
    await openPanel(mod, '/painel/comentarios');
    await openMenu(mod);
    await menu(mod).getByRole('button', { name: 'Escolher um capítulo' }).click();
    await expect(menu(mod).getByRole('button', { name: /^\d+\. / })).toHaveText([
      '6. Comentários e moderação',
      '10. Conta e instalação',
    ]);
  });

  for (const [path, first] of [
    ['/painel', 'nav-boas-vindas'],
    ['/painel/livros', 'livros-lista'],
    ['/painel/sessoes', 'sessoes-lista'],
    ['/painel/sessoes/nova', 'editor-abrir'],
    ['/painel/comentarios', 'comentarios-abas'],
    ['/painel/membros', 'membros-numeros'],
    ['/painel/sobre', 'sobre-editor'],
    ['/painel/votacoes', 'nav-boas-vindas'],
  ] as const) {
    test(`"Ajuda desta tela" em ${path} abre o capítulo certo`, async ({ openAs }) => {
      const { page } = await openAs(await createAdmin());
      await openPanel(page, path);
      await openMenu(page);
      await menu(page).getByRole('button', { name: 'Ajuda desta tela' }).click();
      await expect(card(page)).toHaveAttribute('data-tour-step', first);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await page.keyboard.press('Escape');
      await expect(card(page)).toHaveCount(0);
      await expect(helpButton(page)).toBeFocused();
    });
  }

  test('teclado: Tab fica no cartão, setas navegam, Esc sai e devolve o foco', async ({
    openAs,
  }) => {
    const { page } = await openAs(await createAdmin());
    await openPanel(page, '/painel/membros');
    await openMenu(page);
    await menu(page).getByRole('button', { name: 'Ajuda desta tela' }).click();
    await expect(card(page)).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-tour-card]'))).toBe(
        true,
      );
    }
    await card(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(card(page)).toHaveAttribute('data-tour-step', 'membros-busca');
    await page.keyboard.press('ArrowLeft');
    await expect(card(page)).toHaveAttribute('data-tour-step', 'membros-numeros');
    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
    await expect(helpButton(page)).toBeFocused();
  });

  test('retomar depois de recarregar', async ({ openAs }) => {
    const { page } = await openAs(await createAdmin());
    await openPanel(page, '/painel/membros');
    await openMenu(page);
    await menu(page).getByRole('button', { name: 'Ajuda desta tela' }).click();
    await card(page).getByRole('button', { name: 'Próximo' }).click();
    await card(page).getByRole('button', { name: 'Próximo' }).click();
    await expect(card(page)).toHaveAttribute('data-tour-step', 'membros-filtros');
    await page.reload();
    await expect(card(page)).toHaveAttribute('data-tour-step', 'membros-filtros');
    await card(page).getByRole('button', { name: 'Sair' }).click();
    await expect(card(page)).toHaveCount(0);
    await page.reload();
    await untilHydrated(helpButton(page));
    await expect(card(page)).toHaveCount(0);
  });

  test('atalho "?": abre o menu, mas nunca dentro de um campo nem no editor', async ({
    openAs,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'webkit-mobile', 'atalho de teclado só no computador');
    const { page } = await openAs(await createAdmin());
    await openPanel(page, '/painel');
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Shift+Slash');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');

    await openPanel(page, '/painel/membros');
    const search = page.locator('[data-tour="members-search"] input:not([type="hidden"])').first();
    await search.focus();
    await page.keyboard.type('?');
    await expect(menu(page)).toBeHidden();
    await expect(search).toHaveValue('?');

    // No editor, um evento de teclado sintético: digitar de verdade criaria um rascunho (o tutorial e os testes dele
    // nunca criam nada). O evento sai do próprio editor, como sairia de uma tecla.
    await openPanel(page, '/painel/sessoes/nova');
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible();
    await editor.dispatchEvent('keydown', { key: '?', shiftKey: true, bubbles: true });
    await expect(menu(page)).toBeHidden();
    // Fora de campo, o mesmo evento abre o menu (prova de que o teste enxerga o atalho).
    await page
      .locator('main h2')
      .first()
      .dispatchEvent('keydown', { key: '?', shiftKey: true, bubbles: true });
    await expect(menu(page)).toBeVisible();
  });

  test('Minha conta: o link abre o capítulo da conta; o endereço sozinho não abre @mobile', async ({
    openAs,
  }) => {
    const { page } = await openAs(await createAdmin());
    await quietFavicon(page);
    await page.goto('/painel?tutorial=conta');
    await untilHydrated(helpButton(page));
    await expect(page).toHaveURL(/\/painel$/);
    await expect(card(page)).toHaveCount(0);

    await page.goto('/painel?tutorial=qualquer-coisa');
    await untilHydrated(helpButton(page));
    await expect(page).toHaveURL(/\/painel$/);
    await expect(card(page)).toHaveCount(0);

    await page.goto('/conta');
    const link = page.getByRole('link', { name: 'Ver o tutorial desta parte' });
    await untilHydrated(link);
    await link.click();
    await expect(card(page)).toHaveAttribute('data-tour-step', 'conta-minha-conta');
    await expect(page).toHaveURL(/\/painel$/);
  });

  test('"Mais" → Tutorial abre o menu do "?" (celular) @mobile', async ({ openAs }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-mobile', 'a barra de baixo só existe no celular');
    const { page } = await openAs(await createAdmin());
    await openPanel(page, '/painel');
    await page.getByRole('button', { name: 'Mais' }).click();
    await page
      .getByRole('dialog', { name: 'Mais' })
      .getByRole('button', { name: 'Tutorial' })
      .click();
    await expect(menu(page)).toBeVisible();
    await menu(page).getByRole('button', { name: 'Tour completo' }).click();
    await expect(card(page)).toHaveAttribute('data-tour-placement', 'sheet');
  });

  test('o "?" fica visível em todo o painel, à esquerda do sino, sem rolagem horizontal', async ({
    openAs,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'webkit-mobile',
      'larguras medidas nos projetos de computador',
    );
    test.slow();
    const { page } = await openAs(await createAdmin());
    const bell = page.getByRole('link', { name: /^Notificações/ });
    async function check(label: string) {
      await expect(helpButton(page), label).toBeVisible();
      await expect(bell, label).toBeVisible();
      const [help, notify] = await Promise.all([
        helpButton(page).boundingBox(),
        bell.boundingBox(),
      ]);
      expect(intersects(help!, notify!), `${label}: "?" sobre o sino`).toBe(false);
      expect(help!.x, `${label}: o "?" fica à esquerda do sino`).toBeLessThan(notify!.x);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${label}: rolagem horizontal`).toBeLessThanOrEqual(0);
    }
    for (const width of [320, 375, 390, 820, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await openPanel(page, '/painel');
      await check(`/painel em ${width}px`);
    }
    // Toda tela do painel, na largura de um celular pequeno, de um iPhone e do computador: uma página mais larga que a
    // tela deslocava a barra de baixo, o menu do "?" e o cartão do tutorial para fora da área de toque.
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of PANEL_ROUTES) {
        await openPanel(page, path);
        await check(`${path} em ${width}px`);
      }
    }
  });

  test('celular: nenhuma tela do painel passa da largura do iPhone, e o "?" abre a ajuda em todas @mobile', async ({
    openAs,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-mobile', 'mede a largura real do iPhone');
    test.slow();
    const { page } = await openAs(await createAdmin());
    for (const path of ['/painel', ...PANEL_ROUTES]) {
      await openPanel(page, path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path}: mais larga que o iPhone`).toBeLessThanOrEqual(0);
      await openMenu(page);
      await menu(page).getByRole('button', { name: 'Ajuda desta tela' }).click();
      await checkStep(page);
      await card(page).getByRole('button', { name: 'Sair' }).click();
      await expect(card(page)).toHaveCount(0);
    }
  });

  test('a dica do "?" fica dentro de uma tela de 320px', async ({ openAs }) => {
    const { page } = await openAs(await createAdmin({ tutorial: 'unseen' }));
    await page.setViewportSize({ width: 320, height: 640 });
    await openPanel(page, '/painel');
    await welcome(page).getByRole('button', { name: 'Agora não' }).click();
    const hint = page.locator('[data-tour-hint="review"]');
    await expect(hint).toBeVisible();
    await expect
      .poll(async () => {
        const box = await hint.boundingBox();
        return box !== null && box.x >= 15 && box.x + box.width <= 320 - 15;
      })
      .toBe(true);
  });

  test('acessibilidade: menu e cartão abertos sem violação séria @mobile', async ({ openAs }) => {
    const { page } = await openAs(await createAdmin());
    await openPanel(page, '/painel/membros');
    await openMenu(page);
    await untilMotionSettles(page);
    let results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
    await menu(page).getByRole('button', { name: 'Ajuda desta tela' }).click();
    await checkStep(page);
    await untilMotionSettles(page);
    results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});
