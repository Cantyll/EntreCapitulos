import type { Page } from '@playwright/test';

import { lit, sql } from '../support/db';
import { expect, test } from '../support/fixtures';
import { fillUntilEnabled, untilHydrated } from '../support/hydration';
import { coverPng } from '../support/png';
import { createAdmin, createUser, type TestUser } from '../support/users';

const DEFAULT_ROSE_2 = '#b04c69';

/** Valor do token no `<html>` da página atual (o tema vem do servidor, em `style`). */
const token = (page: Page, name: string) =>
  page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(),
    name,
  );

const saved = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^(Rascunho salvo|Salvo)$/ });

/**
 * O painel mexe no estado GLOBAL do banco (só um livro "em leitura", numeração das sessões), então
 * estes testes rodam em série, num só projeto, depois de todos os outros (ver playwright.config.ts).
 * Cada passo depende do anterior.
 */
test.describe.serial('painel da administração', () => {
  let admin: TestUser;
  const stamp = Date.now().toString(36);
  const bookTitle = `Livro do Painel ${stamp}`;
  const sessionTitle = `Sessão do painel ${stamp}`;
  let bookSlug = '';
  let editUrl = '';
  let draftUrl = '';

  test.beforeAll(async () => {
    admin = await createAdmin();
  });

  test('termina o livro atual, cadastra um livro com capa e começa a ler', async ({ openAs }) => {
    const { page } = await openAs(admin);

    await page.goto('/painel/livros');
    await page.getByRole('button', { name: 'Marcar livro como terminado' }).click();
    await page.getByLabel('Nota do livro').selectOption({ label: '4,0 de 5' });
    await page.getByRole('button', { name: 'Marcar como terminado' }).click();
    await expect(page.getByRole('region', { name: 'Leitura atual' })).not.toContainText(
      'O Livro de Azrael',
    );

    await page.goto('/painel/livros/novo');
    await page.getByLabel('Título', { exact: true }).fill(bookTitle);
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
    await page.getByRole('button', { name: `Começar a ler ${bookTitle}` }).click();
    await expect(page.getByRole('region', { name: 'Leitura atual' })).toContainText(bookTitle);
    bookSlug = sql(`select slug from public.books where title = ${lit(bookTitle)};`);
  });

  test('o tema da capa vale no site e no painel e some ao desligar o tema automático', async ({
    openAs,
    browser,
  }) => {
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

  test('escreve uma sessão: negrito, divisórias, título do divisor, trecho, pergunta, autosave e retomada', async ({
    openAs,
  }) => {
    const { page } = await openAs(admin);
    await page.goto('/painel/sessoes/nova');
    await expect(page.getByRole('textbox', { name: 'Do capítulo' })).toHaveValue('1');
    await expect(page.getByRole('textbox', { name: 'Até o capítulo' })).toHaveValue('3');

    const title = page.getByLabel('Título da sessão');
    await untilHydrated(title);
    await title.fill(sessionTitle);
    const editor = page.getByRole('textbox', { name: 'Relato da sessão' });
    await editor.click();
    await page.keyboard.type('Abertura da sessão. ');
    await page.getByRole('button', { name: 'Negrito' }).click();
    await page.keyboard.type('texto em negrito');
    await page.getByRole('button', { name: 'Negrito' }).click();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Divisória de capítulo 1' }).click();
    await page.keyboard.type('Texto do primeiro capítulo.');
    await page.getByRole('button', { name: 'Divisória de capítulo 2' }).click();
    await page.keyboard.type('Texto do segundo capítulo.');
    await expect(editor.locator('strong')).toHaveText('texto em negrito');

    // O título da divisória se edita no painel lateral, não dentro do editor.
    await page.getByLabel('Título do capítulo 1').fill('Um começo');
    await expect(saved(page)).toBeVisible();
    expect(page.url()).toMatch(/\/painel\/sessoes\/nova\?sessao=[0-9a-f-]{36}$/);
    editUrl = `/painel/sessoes/${new URL(page.url()).searchParams.get('sessao')}`;

    const notes = page.getByRole('region', { name: 'Trechos e anotações' });
    await page.getByLabel('Capítulo e página').fill('Capítulo 1, página 10');
    await fillUntilEnabled(
      page.getByRole('textbox', { name: 'Trecho' }),
      'Um trecho curto de teste.',
      notes.getByRole('button', { name: 'Adicionar' }),
    );
    await notes.getByRole('button', { name: 'Adicionar' }).click();
    await expect(
      page
        .getByRole('region', { name: 'Trechos e anotações' })
        .getByText('Um trecho curto de teste.'),
    ).toBeVisible();
    const questions = page.getByRole('region', { name: 'Perguntas para a discussão' });
    await fillUntilEnabled(
      page.getByLabel('Nova pergunta'),
      'O que você achou do começo?',
      questions.getByRole('button', { name: 'Adicionar' }),
    );
    await questions.getByRole('button', { name: 'Adicionar' }).click();
    await expect(
      page
        .getByRole('region', { name: 'Perguntas para a discussão' })
        .getByText('O que você achou do começo?'),
    ).toBeVisible();

    // Retomada: depois de recarregar, tudo volta do servidor.
    await page.reload();
    await expect(page.getByLabel('Título da sessão')).toHaveValue(sessionTitle);
    await expect(
      page.getByRole('textbox', { name: 'Relato da sessão' }).locator('strong'),
    ).toHaveText('texto em negrito');
    await expect(page.getByLabel('Título do capítulo 1')).toHaveValue('Um começo');
    await expect(page.getByText('Um trecho curto de teste.')).toBeVisible();
    await expect(page.getByText('O que você achou do começo?')).toBeVisible();
  });

  test('publica a sessão e ela aparece na home e na página do livro', async ({
    openAs,
    browser,
  }) => {
    const { page } = await openAs(admin);
    await page.goto(editUrl);
    await page.getByRole('button', { name: 'Publicar sessão' }).click();
    await expect(page.getByRole('heading', { name: 'Publicar a sessão 1?' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Publicar', exact: true }).click();
    // Vai para a lista (e não fica em /painel/sessoes/<id>, onde a página já estava).
    await expect(page).toHaveURL(/\/painel\/sessoes(\?.*)?$/);

    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto('/');
    await expect(visitor.getByText(sessionTitle).first()).toBeVisible();
    await visitor.goto(`/livros/${bookSlug}/sessoes/1`);
    await expect(visitor.getByRole('heading', { level: 1, name: sessionTitle })).toBeVisible();
    await expect(visitor.getByText('Um trecho curto de teste.')).toBeVisible();
    await expect(visitor.getByText('O que você achou do começo?')).toBeVisible();
    await visitor.context().close();
  });

  test('capítulos que já pertencem a outra sessão são recusados com mensagem clara', async ({
    openAs,
  }) => {
    const { page } = await openAs(admin);
    await page.goto('/painel/sessoes/nova');
    // Com a sessão 1 publicada (capítulos 1 a 3), a próxima nasce em 4 a 6: puxar o início para o 3 sobrepõe.
    await expect(page.getByRole('textbox', { name: 'Do capítulo' })).toHaveValue('4');
    await page.getByRole('textbox', { name: 'Do capítulo' }).fill('3');
    const title = page.getByLabel('Título da sessão');
    await untilHydrated(title);
    await title.fill('Sessão sobreposta');
    await expect(page.getByText(/já pertence à sessão 1\./).first()).toBeVisible();
    // Nada foi criado: continua só a primeira sessão do livro.
    expect(
      sql(
        `select count(*) from public.reading_sessions s join public.books b on b.id = s.book_id where b.title = ${lit(bookTitle)};`,
      ),
    ).toBe('1');
  });

  test('voltar para rascunho é recusado quando a sessão já tem comentários', async ({ openAs }) => {
    // A administração abre a sessão ANTES do primeiro comentário: a tela ainda oferece o botão, e é o
    // servidor que recusa (a tela só esconde o botão quando já sabe dos comentários).
    const { page } = await openAs(admin);
    await page.goto(editUrl);
    const back = page.getByRole('button', { name: 'Voltar para rascunho' });
    await expect(back).toBeVisible();

    const { page: reader } = await openAs(await createUser());
    await reader.goto(`/livros/${bookSlug}/sessoes/1`);
    const field = reader.getByLabel('Seu comentário');
    await untilHydrated(field);
    await field.fill('Um comentário para travar o rascunho.');
    await reader.getByRole('button', { name: 'Publicar comentário' }).click();
    await expect(
      reader
        .getByRole('status')
        .filter({ hasText: /Recebemos seu comentário|Comentário publicado/ }),
    ).toBeVisible();

    await back.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Voltar para rascunho' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'já tem comentários' })).toBeVisible();

    // Recarregando, a tela já sabe: sem botão e com a explicação.
    await page.reload();
    await expect(page.getByText(/já tem comentários e não volta para rascunho/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Voltar para rascunho' })).toHaveCount(0);
  });

  test('sem conexão o rascunho fica salvo só no aparelho e sincroniza sozinho ao voltar a rede', async ({
    openAs,
  }) => {
    const { page, context } = await openAs(admin);
    await page.goto('/painel/sessoes/nova');
    const title = page.getByLabel('Título da sessão');
    await untilHydrated(title);
    await title.fill('Rascunho do autosave');
    await expect(saved(page)).toBeVisible();
    draftUrl = page.url();
    await page.reload();

    const editor = page.getByRole('textbox', { name: 'Relato da sessão' });
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await editor.click();
    await context.setOffline(true);
    await page.keyboard.type('Texto escrito sem rede');
    await expect(
      page.getByRole('status').filter({ hasText: 'Sem conexão: salvo só neste aparelho' }),
    ).toBeVisible();

    await context.setOffline(false);
    await expect(saved(page)).toBeVisible();
    await expect
      .poll(() =>
        sql(`select body::text from public.reading_sessions where title = 'Rascunho do autosave';`),
      )
      .toContain('Texto escrito sem rede');
  });

  test('a mesma sessão alterada em duas abas mostra o banner de conflito e deixa carregar a versão do servidor', async ({
    openAs,
  }) => {
    const { page: first, context } = await openAs(admin);
    await first.goto(draftUrl);
    const second = await context.newPage();
    await second.goto(draftUrl);
    for (const page of [first, second]) {
      await expect(page.getByRole('textbox', { name: 'Relato da sessão' })).toHaveAttribute(
        'contenteditable',
        'true',
      );
      await untilHydrated(page.getByLabel('Título da sessão'));
    }

    await first.getByLabel('Título da sessão').fill('Título pela primeira aba');
    await expect(saved(first)).toBeVisible();
    await expect
      .poll(() =>
        sql(
          `select count(*) from public.reading_sessions where title = 'Título pela primeira aba';`,
        ),
      )
      .toBe('1');

    await second.getByLabel('Título da sessão').fill('Título pela segunda aba');
    await expect(second.getByText('Esta sessão foi alterada em outro lugar')).toBeVisible();
    await second.getByRole('button', { name: 'Carregar a versão do servidor' }).click();
    await expect(second.getByLabel('Título da sessão')).toHaveValue('Título pela primeira aba');
    await expect(second.getByText('Esta sessão foi alterada em outro lugar')).toHaveCount(0);
  });
});
