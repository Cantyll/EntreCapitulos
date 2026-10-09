import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { untilHydrated } from '../support/hydration';
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

    // "Carregando o editor…" some quando o editor fica pronto, e a coluna encolhe: medir antes dava uma sobreposição falsa.
    const loading = page.getByText('Carregando o editor…');

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/painel/sessoes/nova');
    await expect(options).toBeVisible();
    await expect(loading).toBeHidden();
    const textBox = await box(text);
    expect(textBox.width).toBeGreaterThanOrEqual(600);
    expect((await box(options)).y).toBeGreaterThanOrEqual(textBox.y + textBox.height);
    await noHorizontalScroll(page, 'editor 1024');

    // Computador: as opções ao lado do texto.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/painel/sessoes/nova');
    await expect(options).toBeVisible();
    await expect(loading).toBeHidden();
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

/*
 * Segunda passada (adapt): larguras médias, tela de 2560px, faixas que rolam de lado, impressão e alto contraste.
 */
test.describe('adaptação a telas: segunda passada', () => {
  test('livro entre 761 e 1020px: a capa cabe na coluna e não cobre o título', async ({ page }) => {
    for (const width of [800, 900, 1020]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(SEED_BOOK);
      const cover = await box(page.getByRole('img', { name: /^Capa de / }).first());
      const title = await box(page.getByRole('heading', { level: 1 }));
      expect(cover.x + cover.width, `capa sobre o título em ${width}px`).toBeLessThanOrEqual(
        title.x,
      );
      await noHorizontalScroll(page, `livro ${width}`);
    }
  });

  test('Livros do painel: cartões com o editar à vista no celular, tabela no computador', async ({
    openAs,
  }) => {
    test.slow();
    const { page } = await openAs(await createAdmin());
    const list = page.locator('[data-tour="books-list"]:visible');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/painel/livros');
    await expect(list).toHaveCount(1);
    await expect(list.getByRole('table')).toHaveCount(0);
    const edits = list.getByRole('link', { name: /^Editar / });
    expect(await edits.count()).toBeGreaterThan(0);
    for (const edit of (await edits.all()).slice(0, 5)) {
      const { x, width } = await box(edit);
      expect(x + width, 'editar fora da tela').toBeLessThanOrEqual(390);
    }
    await noHorizontalScroll(page, 'livros 390');

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/painel/livros');
    await expect(list.getByRole('table')).toBeVisible();
    // A tabela cabe na lista, sem rolar de lado (uma palavra enorme no título quebra).
    expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('menu no celular: o item atual aparece inteiro e a borda esfumada avisa que há mais', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const nav = page.getByRole('navigation', { name: 'Principal' });

    // "Sobre o clube" é o último item: antes ficava cortado na borda, sem aviso.
    await page.goto('/sobre');
    const current = nav.locator('[aria-current="page"]');
    await expect(nav).toHaveAttribute('data-fade', 'start');
    let navBox = await box(nav);
    let item = await box(current);
    expect(item.x).toBeGreaterThanOrEqual(navBox.x);
    expect(item.x + item.width).toBeLessThanOrEqual(navBox.x + navBox.width);

    // Na página do livro sobra menu à direita; o item que recebe o foco sai do esfumado.
    await page.goto(SEED_BOOK);
    await expect(nav).toHaveAttribute('data-fade', /end|both/);
    const last = nav.getByRole('link', { name: 'Sobre o clube' });
    await last.focus();
    await expect(nav).toHaveAttribute('data-fade', 'start');
    // No fim da faixa não há esfumado à direita: o item inteiro dentro dela basta.
    navBox = await box(nav);
    item = await box(last);
    expect(item.x + item.width).toBeLessThanOrEqual(navBox.x + navBox.width);
  });

  test('título da sessão: cresce com o texto e o Enter vai para o relato', async ({ openAs }) => {
    test.slow();
    const { page } = await openAs(await createAdmin());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/painel/sessoes/nova');
    const title = page.getByLabel('Título da sessão');
    await untilHydrated(title);
    // Com o editor pronto: antes disso o título está desativado e o React ainda pode refazê-lo.
    await expect(title).toBeEnabled();
    const oneLine = (await box(title)).height;

    // Só o valor do DOM, sem passar pelo React: digitar criaria um rascunho (estado global do banco).
    await title.evaluate((el: HTMLTextAreaElement) => {
      el.value = 'Um título bem comprido para ver a caixa crescer em vez de rolar escondida';
    });
    // A largura muda (girar o aparelho): onde field-sizing não existe, o hook mede de novo.
    await page.setViewportSize({ width: 380, height: 844 });
    await expect.poll(async () => (await box(title)).height).toBeGreaterThan(oneLine * 2);
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await title.evaluate((el: HTMLTextAreaElement) => {
      el.value = '';
    });

    await title.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Relato da sessão' })).toBeFocused();
    await expect(title).toHaveValue('');
  });

  test('tela de 2560px: o "?" e o sino param onde o conteúdo do painel para', async ({
    openAs,
  }) => {
    const { page } = await openAs(await createAdmin());
    await page.setViewportSize({ width: 2560, height: 1200 });
    await page.goto('/painel/sessoes');
    const bell = await box(
      page.locator('[data-admin-topbar]').getByRole('link', { name: /^Notificações/ }),
    );
    const main = await box(page.locator('main#conteudo'));
    // O conteúdo termina 34px antes da borda do <main> (o preenchimento dele).
    expect(Math.abs(bell.x + bell.width - (main.x + main.width - 34))).toBeLessThanOrEqual(2);
  });

  test('impressão: sai o texto, sem menus nem controles, e o trecho coberto vira aviso', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(sessionPath(WORLD.readingSlug, WORLD.sessions.public.number));
    await expect(page.locator('[inert]').first()).toBeAttached();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('banner')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeHidden();
    await expect(page.getByRole('link', { name: /^Voltar/ })).toBeHidden();
    await expect(page.getByRole('complementary', { name: 'Sobre o livro' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Outras sessões' })).toBeHidden();
    await expect(page.locator('[inert]').first()).toBeHidden();
    await expect(page.getByText('Trecho coberto pelo filtro de spoiler').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Na tela, o aviso de impressão não aparece (nem para o leitor de tela).
    await page.emulateMedia({ media: 'screen' });
    await expect(page.getByText('Trecho coberto pelo filtro de spoiler').first()).toBeHidden();
  });

  test('alto contraste: item atual, aba e interruptor continuam à vista', async ({
    openAs,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'só o Chromium emula as cores forçadas');
    const { page } = await openAs(await createAdmin());
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ forcedColors: 'active' });
    const differsFromPage = (el: Element) =>
      getComputedStyle(el).backgroundColor !== getComputedStyle(document.body).backgroundColor;

    await page.goto('/sessoes');
    const current = page
      .getByRole('navigation', { name: 'Principal' })
      .locator('[aria-current="page"]');
    expect(await current.evaluate(differsFromPage)).toBe(true);
    expect(await current.evaluate((el) => getComputedStyle(el).forcedColorAdjust)).toBe('none');

    await page.goto('/painel/sessoes/nova');
    const tab = page.getByRole('tab', { selected: true });
    expect(await tab.evaluate(differsFromPage)).toBe(true);
    const toggle = page.getByRole('switch', { name: 'Abrir comentários' });
    expect(await toggle.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect(await toggle.evaluate((el) => getComputedStyle(el, '::after').backgroundColor)).not.toBe(
      await toggle.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
  });
});
