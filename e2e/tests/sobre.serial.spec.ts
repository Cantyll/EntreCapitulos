import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import sharp from 'sharp';

import { sql } from '../support/db';
import { expect, test } from '../support/fixtures';
import { untilHydrated } from '../support/hydration';
import {
  SOBRE_ORDER,
  WIDTHS,
  blockOrder,
  expectNoHorizontalScroll,
  typeInRichField,
} from '../support/sobre';
import { createAdmin, type TestUser } from '../support/users';

/*
 * Página Sobre editável (etapa 8j). O conteúdo publicado é GLOBAL (uma página só), então estes testes rodam em série,
 * num só projeto, depois dos outros (ver playwright.config.ts). Cada passo depende do anterior; o primeiro confere o
 * texto de código com NADA publicado (o `globalSetup` esvazia as tabelas antes de o app subir).
 */

const CODE_TITLE = 'Oi, eu sou a Agatha.';
const CODE_TEXT = 'lápis na mão';

const TITLE = 'Bem-vinda ao meu cantinho de leitura';
const INTRO = 'Este é o texto novo da abertura, escrito pela administração.';
const SCRIPT_TEXT = '<script>window.__xss = 1</script>';

const editor = (page: Page) => page.locator('[data-editor-root]');
const save = (page: Page) => page.getByRole('button', { name: 'Salvar rascunho' });
const publish = (page: Page) => page.getByRole('button', { name: 'Publicar', exact: true });
const status = (page: Page) => page.locator('[data-about-status]');

/** Um visitante (contexto sem login) com a mesma vigia dos outros contextos: CSP, console.error e respostas 5xx. */
async function openVisitor(
  browser: Browser,
  guard: { watchContext: (context: BrowserContext) => Promise<void> },
) {
  const context = await browser.newContext();
  await guard.watchContext(context);
  return { context, page: await context.newPage() };
}

async function openEditor(page: Page) {
  await page.goto('/painel/sobre');
  await expect(page.getByRole('heading', { level: 1, name: 'Página Sobre' })).toBeVisible();
  await untilHydrated(page.getByLabel('Título da página'));
}

test.describe.serial('página Sobre editável', () => {
  let admin: TestUser;

  test.beforeAll(async () => {
    admin = await createAdmin();
  });

  test('sem nada publicado, /sobre mostra o texto de código na ordem esperada, sem rolagem horizontal', async ({
    page,
  }) => {
    expect(sql(`select count(*) from public.site_pages;`)).toBe('0');
    await page.goto('/sobre');
    await expect(page.getByRole('heading', { level: 1, name: CODE_TITLE })).toBeVisible();
    await expect(page.locator('[data-about="text"]')).toContainText(CODE_TEXT);
    await expect(page.getByRole('heading', { name: 'Combinados da comunidade' })).toBeVisible();
    // Sem seções extras: a ordem pula "sections".
    expect(await blockOrder(page)).toEqual(SOBRE_ORDER.filter((name) => name !== 'sections'));
    for (const width of WIDTHS) await expectNoHorizontalScroll(page, width);
  });

  test('a administração vê o aviso do texto provisório na Visão geral e em /painel/sobre', async ({
    openAs,
  }) => {
    const { page } = await openAs(admin);
    await page.goto('/painel');
    const notice = page.locator('[data-about-provisional]');
    await expect(notice).toContainText(
      'A página Sobre ainda usa o texto provisório. Edite e publique antes do lançamento.',
    );
    await notice.getByRole('link', { name: 'Abrir a página Sobre' }).click();
    await expect(page).toHaveURL(/\/painel\/sobre$/);
    await expect(page.locator('[data-about-provisional]')).toContainText(
      'ainda usa o texto provisório',
    );
    // O aviso é só da administração: o visitante nunca o vê.
  });

  test('edita, salva o rascunho (o visitante continua vendo o texto de código) e publica', async ({
    openAs,
    browser,
    guard,
  }) => {
    const { page } = await openAs(admin);
    await openEditor(page);

    // Nada salvo ainda; o primeiro texto vem do código.
    await expect(status(page)).toHaveText('Nada salvo ainda');
    await expect(save(page)).toBeDisabled();

    await page.getByLabel('Título da página').fill(TITLE);
    await expect(status(page)).toHaveText('Alterações não salvas');
    await typeInRichField(page, 'Texto de abertura', INTRO);

    // Seção extra, link e interruptores.
    await page.getByRole('button', { name: 'Adicionar seção' }).click();
    await page.getByLabel('Título da seção 1').fill('Minha rotina de leitura');
    await typeInRichField(page, 'Texto da seção 1', SCRIPT_TEXT);
    await page.getByRole('button', { name: 'Adicionar link' }).click();
    await page.getByLabel('Texto do link 1').fill('Meu blog');
    await page.getByLabel('Endereço do link 1').fill('blog.exemplo.com/leituras');
    await page.getByLabel('Endereço do link 1').blur();
    await expect(page.getByLabel('Endereço do link 1')).toHaveValue(
      'https://blog.exemplo.com/leituras',
    );

    await save(page).click();
    await expect(status(page)).toContainText('Rascunho salvo em');
    await expect(page.getByRole('status').filter({ hasText: 'Rascunho salvo.' })).toBeVisible();
    await expect(save(page)).toBeDisabled();

    // O rascunho NUNCA é público: um visitante (contexto sem login) ainda vê o texto de código.
    const { context: visitor, page: visitorPage } = await openVisitor(browser, guard);
    await visitorPage.goto('/sobre');
    await expect(visitorPage.getByRole('heading', { level: 1, name: CODE_TITLE })).toBeVisible();
    await expect(visitorPage.getByText(TITLE)).toHaveCount(0);

    // Publicar pede confirmação.
    await publish(page).click();
    const dialog = page.getByRole('dialog', { name: 'Publicar a página Sobre?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    expect(sql(`select count(*) from public.site_pages;`)).toBe('0');

    await publish(page).click();
    await page
      .getByRole('dialog', { name: 'Publicar a página Sobre?' })
      .getByRole('button', { name: 'Publicar' })
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Página publicada' })).toBeVisible();
    expect(sql(`select count(*) from public.site_pages;`)).toBe('1');
    // O aviso do texto provisório some depois da primeira publicação.
    await expect(page.locator('[data-about-provisional]')).toHaveCount(0);

    // O visitante vê o texto novo (a tag site:sobre expirou na publicação).
    await visitorPage.reload();
    await expect(visitorPage.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(visitorPage.locator('[data-about="text"]')).toContainText(INTRO);
    await expect(
      visitorPage.getByRole('heading', { name: 'Minha rotina de leitura' }),
    ).toBeVisible();
    // Um <script> digitado aparece como TEXTO e nunca roda.
    await expect(visitorPage.locator('[data-about-section="1"]')).toContainText(SCRIPT_TEXT);
    expect(
      await visitorPage.evaluate(() => (window as unknown as { __xss?: number }).__xss),
    ).toBeUndefined();
    // O link é https, abre em outra aba e tem rel noopener noreferrer.
    const link = visitorPage.getByRole('link', { name: /Meu blog/ });
    await expect(link).toHaveAttribute('href', 'https://blog.exemplo.com/leituras');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await blockOrder(visitorPage)).toEqual([...SOBRE_ORDER]);
    for (const width of WIDTHS) await expectNoHorizontalScroll(visitorPage, width);
    await visitor.close();
  });

  test('interruptores: um bloco oculto some da página pública; Combinados e Leia como aplicativo ficam', async ({
    openAs,
    browser,
    guard,
  }) => {
    const { page } = await openAs(admin);
    await openEditor(page);
    await page.getByRole('switch', { name: 'Estatísticas' }).click();
    await page.getByRole('switch', { name: 'Como funciona' }).click();
    await page.getByRole('switch', { name: 'Chamada final' }).click();
    await publish(page).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Página publicada' })).toBeVisible();

    const { context: visitor, page: visitorPage } = await openVisitor(browser, guard);
    await visitorPage.goto('/sobre');
    expect(await blockOrder(visitorPage)).toEqual([
      'presentation',
      'text',
      'sections',
      'rules',
      'app',
    ]);
    await expect(visitorPage.getByRole('heading', { name: 'Como funciona' })).toHaveCount(0);
    await expect(
      visitorPage.getByRole('heading', { name: 'Combinados da comunidade' }),
    ).toBeVisible();
    await expect(visitorPage.getByRole('heading', { name: 'Leia como aplicativo' })).toBeVisible();
    await visitor.close();
  });

  test('conflito entre duas abas: a segunda recebe o banner e escolhe a versão', async ({
    openAs,
  }) => {
    const a = await openAs(admin);
    const b = await openAs(admin);
    await openEditor(a.page);
    await openEditor(b.page);

    await a.page.getByLabel('Título da página').fill('Título da aba A');
    await save(a.page).click();
    await expect(status(a.page)).toContainText('Rascunho salvo em');

    await b.page.getByLabel('Título da página').fill('Título da aba B');
    await save(b.page).click();
    const banner = b.page.locator('[data-about-conflict]');
    await expect(banner).toContainText('Outra pessoa da administração mudou esta página');
    // Nada foi gravado pela aba B.
    expect(sql(`select content->>'title' from public.site_page_drafts;`)).toBe('Título da aba A');

    // "Carregar a versão do servidor" traz o texto da aba A.
    await banner.getByRole('button', { name: 'Carregar a versão do servidor' }).click();
    await expect(b.page.getByLabel('Título da página')).toHaveValue('Título da aba A');
    await expect(banner).toHaveCount(0);
    await expect(status(b.page)).toContainText('Rascunho salvo em');

    // De novo em conflito (a aba A salva outra vez), agora "Sobrescrever com a minha".
    await a.page.getByLabel('Título da página').fill('Título da aba A, de novo');
    await save(a.page).click();
    await expect(status(a.page)).toContainText('Rascunho salvo em');
    await b.page.getByLabel('Título da página').fill('Título da aba B, a vencedora');
    await save(b.page).click();
    await expect(b.page.locator('[data-about-conflict]')).toBeVisible();
    await b.page.getByRole('button', { name: 'Sobrescrever com a minha' }).click();
    await expect(status(b.page)).toContainText('Rascunho salvo em');
    expect(sql(`select content->>'title' from public.site_page_drafts;`)).toBe(
      'Título da aba B, a vencedora',
    );
  });

  test('pré-visualização: o componente REAL, com o texto do formulário, em celular e computador, sem rolagem horizontal', async ({
    openAs,
    browser,
    guard,
  }) => {
    const { page } = await openAs(admin);
    await openEditor(page);
    await page.getByLabel('Título da página').fill('Título só na prévia');
    await page.getByRole('tab', { name: 'Pré-visualizar' }).click();
    // A aba "Editar" some de verdade (o atributo hidden perdia para o display do painel): nenhum campo na tela.
    await expect(page.getByLabel('Título da página')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Histórico' })).toBeHidden();

    // O texto NÃO salvo aparece na prévia, e o visitante não o vê.
    const frame = page.locator('[data-about-preview-host] [data-about-root]');
    await expect(
      frame.getByRole('heading', { level: 1, name: 'Título só na prévia' }),
    ).toBeAttached();
    const { context: visitor, page: visitorPage } = await openVisitor(browser, guard);
    await visitorPage.goto('/sobre');
    await expect(visitorPage.getByText('Título só na prévia')).toHaveCount(0);
    await visitor.close();

    // Celular: uma coluna (o cartão da autora vem ANTES do texto, um embaixo do outro), mesmo com a janela larga.
    await expect(page.locator('[data-about-preview="phone"]')).toBeVisible();
    const phone = await page.evaluate(() => {
      const card = document
        .querySelector('[data-about-preview-host] aside[data-about="presentation"]')!
        .getBoundingClientRect();
      const text = document
        .querySelector('[data-about-preview-host] [data-about="text"]')!
        .getBoundingClientRect();
      return {
        cardBottom: card.bottom,
        textTop: text.top,
        cardLeft: card.left,
        textLeft: text.left,
      };
    });
    expect(phone.textTop).toBeGreaterThanOrEqual(phone.cardBottom - 1);

    // Computador: duas colunas (o cartão fica ao lado do texto).
    await page.getByRole('button', { name: 'Computador' }).click();
    await expect(page.locator('[data-about-preview="desktop"]')).toBeVisible();
    await expect(page.locator('[data-about-preview-host] > div')).toHaveCSS('width', '1280px');
    const desktop = await page.evaluate(() => {
      const card = document
        .querySelector('[data-about-preview-host] aside[data-about="presentation"]')!
        .getBoundingClientRect();
      const text = document
        .querySelector('[data-about-preview-host] [data-about="text"]')!
        .getBoundingClientRect();
      return { cardLeft: card.left, textRight: text.right, cardTop: card.top, textTop: text.top };
    });
    expect(desktop.cardLeft).toBeGreaterThanOrEqual(desktop.textRight - 1);

    // A prévia é inerte (nenhum link funciona nem recebe foco) e a ordem dos blocos é a da página pública (aqui, com
    // estatísticas, "Como funciona" e a chamada final ocultos pelo teste anterior).
    await expect(page.locator('[data-about-preview-host] > div')).toHaveAttribute('inert', '');
    expect(
      await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll('[data-about-preview-host] [data-about]')) {
          const v = el.getAttribute('data-about')!;
          if (out.at(-1) !== v) out.push(v);
        }
        return out;
      }),
    ).toEqual(['presentation', 'text', 'sections', 'rules', 'app']);

    for (const device of ['Celular', 'Computador']) {
      await page.getByRole('button', { name: device }).click();
      for (const width of WIDTHS) await expectNoHorizontalScroll(page, width);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    // Voltar para "Editar" mantém o texto digitado (nada se perdeu ao trocar de aba).
    await page.getByRole('tab', { name: 'Editar' }).click();
    await expect(page.getByLabel('Título da página')).toHaveValue('Título só na prévia');
    await expect(page.locator('[data-about-preview-host]')).toBeHidden();
  });

  test('histórico: as versões publicadas, restaurar uma (com confirmação) a publica e a coloca no rascunho', async ({
    openAs,
    browser,
    guard,
  }) => {
    const { page } = await openAs(admin);
    // Três publicações seguidas, com títulos conhecidos.
    for (const title of ['Versão histórica A', 'Versão histórica B', 'Versão histórica C']) {
      await openEditor(page);
      await page.getByLabel('Título da página').fill(title);
      await publish(page).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Publicar' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Página publicada' })).toBeVisible();
    }

    await openEditor(page);
    const history = page.locator('[data-history-id]');
    await expect(history.first()).toContainText('no ar agora');
    await expect(history.first()).toContainText('Versão histórica C');
    // A mais recente não tem "Restaurar"; as outras têm.
    await expect(history.first().getByRole('button', { name: /Restaurar/ })).toHaveCount(0);

    const target = history.filter({ hasText: 'Versão histórica A' });
    await target.getByRole('button', { name: /Restaurar a versão de/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Restaurar esta versão?' });
    await expect(dialog).toBeVisible();
    // Cancelar não muda nada.
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    expect(sql(`select content->>'title' from public.site_pages;`)).toBe('Versão histórica C');

    await target.getByRole('button', { name: /Restaurar a versão de/ }).click();
    await page
      .getByRole('dialog', { name: 'Restaurar esta versão?' })
      .getByRole('button', { name: 'Restaurar e publicar' })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'restaurada e publicada' }),
    ).toBeVisible();

    // Está no ar e no rascunho, e o editor mostra o texto restaurado.
    expect(sql(`select content->>'title' from public.site_pages;`)).toBe('Versão histórica A');
    expect(sql(`select content->>'title' from public.site_page_drafts;`)).toBe(
      'Versão histórica A',
    );
    await expect(page.getByLabel('Título da página')).toHaveValue('Versão histórica A');
    const { context: visitor, page: visitorPage } = await openVisitor(browser, guard);
    await visitorPage.goto('/sobre');
    await expect(
      visitorPage.getByRole('heading', { level: 1, name: 'Versão histórica A' }),
    ).toBeVisible();
    await visitor.close();

    // O histórico ganha uma "Restauração" no topo (a lista é refeita depois de restaurar).
    await expect(history.first()).toContainText('Restauração');
    await expect(history.first()).toContainText('no ar agora');
    expect(sql(`select kind from public.site_page_revisions order by id desc limit 1;`)).toBe(
      'restore',
    );
  });

  test('teclado: Tab atravessa o formulário até a barra de baixo (sem armadilha de foco) e os botões de ordem funcionam sem mouse', async ({
    openAs,
  }) => {
    const { page } = await openAs(admin);
    await openEditor(page);
    // Garante duas seções: a do passo anterior e mais uma.
    if ((await page.getByRole('button', { name: 'Subir seção 1' }).count()) === 0) {
      await page.getByRole('button', { name: 'Adicionar seção' }).click();
    }
    await page.getByRole('button', { name: 'Adicionar seção' }).click();
    await page.getByLabel('Título da seção 2').fill('Segunda seção');

    // Tab de verdade, do primeiro campo até "Publicar" (habilitado: há alterações): nenhum campo de texto rico, botão
    // de ordem ou interruptor segura o foco, e os botões de ordem aparecem no caminho.
    await page.getByLabel('Título da página').focus();
    const visited: string[] = [];
    for (let step = 0; step < 150; step += 1) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el
          ? (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim()
          : '';
      });
      visited.push(label);
      if (label === 'Publicar') break;
    }
    expect(visited.at(-1)).toBe('Publicar');
    expect(visited).toEqual(
      expect.arrayContaining(['Descer seção 1', 'Subir seção 2', 'Salvar rascunho']),
    );

    const down1 = page.getByRole('button', { name: 'Descer seção 1' });
    await down1.focus();
    await page.keyboard.press('Enter');
    // A seção que estava em 1 agora é a 2: o título dela está no campo 2, e o foco continua no botão de descer
    // do mesmo item (agora o 2... que está no extremo: o foco vai para "Subir").
    await expect(page.getByLabel('Título da seção 1')).toHaveValue('Segunda seção');
    await expect(page.getByLabel('Título da seção 2')).toHaveValue('Minha rotina de leitura');
    await expect(page.getByRole('button', { name: 'Subir seção 2' })).toBeFocused();
    await expect(
      page.getByRole('status').filter({ hasText: 'Seção 1 movida para a posição 2 de 2.' }),
    ).toBeAttached();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Título da seção 1')).toHaveValue('Minha rotina de leitura');
  });

  test('o editor passa no axe (sem violações sérias nem críticas)', async ({ openAs }) => {
    const { page } = await openAs(admin);
    await openEditor(page);
    const results = await new AxeBuilder({ page })
      .include('[data-editor-root]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
    void editor;
  });

  test('foto: arquivo falso é recusado sem deixar sobra; a foto boa vira 512x512 sem metadados, exige o alt, vai ao ar e some ao remover', async ({
    openAs,
    browser,
    guard,
  }) => {
    const { page } = await openAs(admin);
    await openEditor(page);
    // Compara NOMES, não totais: a varredura apaga sobras antigas de rodadas anteriores a qualquer momento.
    const names = (like: string) =>
      new Set(
        sql(
          `select name from storage.objects where bucket_id = 'covers' and name like '${like}' order by name;`,
        )
          .split('\n')
          .filter(Boolean),
      );
    const added = (like: string, before: Set<string>) =>
      [...names(like)].filter((name) => !before.has(name));
    const objects = (name: string) => names(name).size;
    const input = page.getByLabel('Escolher o arquivo da foto da autora');
    const incomingBefore = names('site/sobre/incoming/%');
    const finalsBefore = names('site/sobre/%.webp');

    // Um texto com nome e tipo de PNG: o navegador deixa passar (só confere o tipo declarado), o servidor confere o
    // formato REAL e recusa. Nada fica no Storage (nem o original enviado).
    await input.setInputFiles({
      name: 'foto.png',
      mimeType: 'image/png',
      buffer: Buffer.from('não sou uma imagem de verdade'),
    });
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'O arquivo não é uma imagem PNG, JPG ou WEBP válida.' }),
    ).toBeVisible();
    await expect(page.getByLabel('Texto alternativo da foto (obrigatório)')).toHaveCount(0);
    expect(added('site/sobre/incoming/%', incomingBefore)).toEqual([]);
    expect(added('site/sobre/%.webp', finalsBefore)).toEqual([]);

    // Tipo que o navegador já recusa (GIF), sem nem ir ao Storage.
    await input.setInputFiles({
      name: 'foto.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('GIF89a'),
    });
    await expect(
      page.getByRole('alert').filter({ hasText: 'Envie uma imagem PNG, JPG ou WEBP.' }),
    ).toBeVisible();

    // A foto boa: um JPEG com EXIF (copyright e localização) que NÃO pode sobreviver.
    const jpeg = await sharp({
      create: { width: 640, height: 400, channels: 3, background: '#cf6c88' },
    })
      .jpeg()
      .withExif({
        IFD0: { Copyright: 'SEGREDO-E2E-DA-FOTO' },
        IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '11 51 0' },
      } as never)
      .toBuffer();
    await input.setInputFiles({ name: 'retrato.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    const alt = page.getByLabel('Texto alternativo da foto (obrigatório)');
    await expect(alt).toBeVisible();
    await expect(alt).toBeFocused();
    expect(added('site/sobre/incoming/%', incomingBefore)).toEqual([]);
    expect(added('site/sobre/%.webp', finalsBefore)).toHaveLength(1);

    // Sem o texto alternativo não salva, e o aviso aparece junto do campo.
    await expect(save(page)).toBeEnabled();
    await save(page).click();
    await expect(page.getByText('Descreva a foto no texto alternativo.').first()).toBeVisible();
    await alt.fill('A Agatha com um livro nas mãos');
    await expect(page.getByText('Descreva a foto no texto alternativo.')).toHaveCount(0);
    await save(page).click();
    await expect(status(page)).toContainText('Rascunho salvo em');

    // O arquivo guardado: WebP 512x512, sem nenhum metadado (lido pela URL pública do Storage).
    const path = sql(`select content->'photo'->>'path' from public.site_page_drafts;`);
    expect(path).toMatch(/^site\/sobre\/[0-9a-f-]{36}\.webp$/);
    const stored = Buffer.from(
      await (
        await fetch(`http://127.0.0.1:54321/storage/v1/object/public/covers/${path}`)
      ).arrayBuffer(),
    );
    const meta = await sharp(stored).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 512, 512]);
    expect(meta.exif).toBeUndefined();
    expect(stored.toString('latin1')).not.toContain('SEGREDO-E2E-DA-FOTO');

    // Publica: o visitante vê a foto com o texto alternativo.
    await publish(page).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Página publicada' })).toBeVisible();
    const { context: visitor, page: visitorPage } = await openVisitor(browser, guard);
    await visitorPage.goto('/sobre');
    const photo = visitorPage.locator('[data-about-photo]');
    await expect(photo).toHaveAttribute('alt', 'A Agatha com um livro nas mãos');
    await expect(photo).toHaveAttribute(
      'src',
      new RegExp(`/storage/v1/object/public/covers/${path}$`),
    );

    // Remover a foto: o cartão volta às iniciais; a foto antiga continua no Storage (o histórico ainda a usa).
    await page.getByRole('button', { name: 'Remover foto' }).click();
    await publish(page).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publicar' }).click();
    // O aviso "Página publicada" da primeira publicação ainda está na tela: o que prova a segunda é o que o visitante vê.
    await expect(async () => {
      await visitorPage.reload();
      await expect(visitorPage.locator('[data-about-photo]')).toHaveCount(0, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    expect(objects(path)).toBe(1);
    await visitor.close();
  });
});
