import type { Locator, Page } from '@playwright/test';

import { lit, sql } from '../support/db';
import { expect, test } from '../support/fixtures';
import { fillUntilEnabled, untilHydrated } from '../support/hydration';
import { createAdmin, type TestUser } from '../support/users';

/**
 * O editor NUNCA pode descartar texto ainda não enviado, nem refazer a tela, quando uma ação que fala
 * com o servidor roda logo depois de digitar (trecho, pergunta, faixa de capítulos, visibilidade, nota,
 * comentários abertos). Regressão de um bug achado no E2E: criar o rascunho trocava a URL de /nova para
 * /<id>, e a primeira ação de trecho ou pergunta fazia o Next buscar outra página e montar o editor de
 * novo, com o texto do servidor. Roda no Chromium e no WebKit do iPhone (grupo serial: só há um livro
 * "em leitura" e um rascunho por vez).
 */
test.describe.serial('editor: texto ainda não enviado sobrevive às ações do servidor', () => {
  let admin: TestUser;
  let draftId = '';

  test.beforeAll(async () => {
    admin = await createAdmin();
    // Um rascunho por vez: limpa os do livro em leitura (restos de outros testes).
    sql(
      `delete from public.reading_sessions where status = 'draft' and book_id in (select id from public.books where status = 'reading');`,
    );
  });

  const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Relato da sessão' });
  const unsent = (page: Page) =>
    page.getByRole('status').filter({ hasText: 'Alterações ainda não enviadas' });
  const saved = (page: Page) =>
    page.getByRole('status').filter({ hasText: /^(Rascunho salvo|Salvo)$/ });

  /** Digita no fim do relato e confere que o autosave ainda NÃO enviou (é o instante do risco). */
  async function typeUnsent(page: Page, text: string) {
    const editor = editorOf(page);
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(` ${text}`);
    await expect(editor).toContainText(text);
    await expect(unsent(page)).toBeVisible();
  }

  /** Marca o nó do editor: se a tela montar de novo, a marca some. */
  const mark = (page: Page) =>
    editorOf(page).evaluate((node) => {
      (node as unknown as { __marca: string }).__marca = 'mesmo-editor';
    });

  async function expectSameEditor(page: Page, tokens: string[]) {
    const editor = editorOf(page);
    expect(
      await editor.evaluate((node) => (node as unknown as { __marca?: string }).__marca),
      'o editor foi montado de novo',
    ).toBe('mesmo-editor');
    for (const token of tokens) await expect(editor).toContainText(token);
  }

  const notes = (page: Page): Locator => page.getByRole('region', { name: 'Trechos e anotações' });
  const questions = (page: Page): Locator =>
    page.getByRole('region', { name: 'Perguntas para a discussão' });

  async function addNote(page: Page, text: string) {
    await page.getByLabel('Capítulo e página').first().fill('Capítulo 1, página 1');
    await fillUntilEnabled(
      page.getByRole('textbox', { name: 'Trecho' }),
      text,
      notes(page).getByRole('button', { name: 'Adicionar' }),
    );
    await notes(page).getByRole('button', { name: 'Adicionar' }).click();
    await expect(notes(page).getByText(text)).toBeVisible();
  }

  test('rascunho novo: digitar e, logo em seguida, usar cada ação do servidor', async ({
    openAs,
  }) => {
    const { page } = await openAs(admin);
    await page.goto('/painel/sessoes/nova');
    const title = page.getByLabel('Título da sessão');
    await untilHydrated(title);
    await title.fill('Rascunho das ações');
    await expect(saved(page)).toBeVisible();
    // A URL do rascunho criado continua na MESMA página (/nova), só com o id: nada de outra rota.
    await expect(page).toHaveURL(/\/painel\/sessoes\/nova\?sessao=[0-9a-f-]{36}$/);
    draftId = new URL(page.url()).searchParams.get('sessao')!;

    await editorOf(page).click();
    await page.keyboard.type('Começo do relato.');
    await expect(saved(page)).toBeVisible();
    await mark(page);
    const tokens = ['Começo do relato.'];

    // 1. Trecho novo.
    await typeUnsent(page, 'alfa');
    tokens.push('alfa');
    await addNote(page, 'Primeiro trecho de teste.');
    await expectSameEditor(page, tokens);

    // 2. Pergunta nova.
    await typeUnsent(page, 'beta');
    tokens.push('beta');
    await fillUntilEnabled(
      page.getByLabel('Nova pergunta'),
      'Primeira pergunta de teste?',
      questions(page).getByRole('button', { name: 'Adicionar' }),
    );
    await questions(page).getByRole('button', { name: 'Adicionar' }).click();
    await expect(questions(page).getByText('Primeira pergunta de teste?')).toBeVisible();
    await expectSameEditor(page, tokens);

    // 3. Segundo trecho, reordenar, editar e remover trecho; depois as mesmas ações em pergunta.
    await typeUnsent(page, 'gama');
    tokens.push('gama');
    await addNote(page, 'Segundo trecho de teste.');
    await expectSameEditor(page, tokens);

    await typeUnsent(page, 'delta');
    tokens.push('delta');
    await notes(page)
      .getByRole('listitem')
      .filter({ hasText: 'Primeiro trecho' })
      .getByRole('button', { name: 'Descer' })
      .click();
    await expect(notes(page).getByRole('listitem').first()).toContainText('Segundo trecho');
    await expectSameEditor(page, tokens);

    await typeUnsent(page, 'epsilon');
    tokens.push('epsilon');
    const second = notes(page).getByRole('listitem').filter({ hasText: 'Segundo trecho' });
    await second.getByRole('button', { name: 'Editar' }).click();
    const edited = notes(page).locator('textarea').first();
    await edited.fill('Segundo trecho editado.');
    await notes(page).getByRole('button', { name: 'Salvar' }).click();
    await expect(notes(page).getByText('Segundo trecho editado.')).toBeVisible();
    await expectSameEditor(page, tokens);

    await typeUnsent(page, 'zeta');
    tokens.push('zeta');
    await notes(page)
      .getByRole('listitem')
      .filter({ hasText: 'Segundo trecho editado' })
      .getByRole('button', { name: 'Remover' })
      .click();
    await expect(notes(page).getByText('Segundo trecho editado.')).toHaveCount(0);
    await expectSameEditor(page, tokens);

    // Pergunta: editar, reordenar (com duas) e remover.
    await fillUntilEnabled(
      page.getByLabel('Nova pergunta'),
      'Segunda pergunta de teste?',
      questions(page).getByRole('button', { name: 'Adicionar' }),
    );
    await questions(page).getByRole('button', { name: 'Adicionar' }).click();
    await expect(questions(page).getByText('Segunda pergunta de teste?')).toBeVisible();

    await typeUnsent(page, 'eta');
    tokens.push('eta');
    await questions(page)
      .getByRole('listitem')
      .filter({ hasText: 'Primeira pergunta' })
      .getByRole('button', { name: 'Descer' })
      .click();
    await expect(questions(page).getByRole('listitem').first()).toContainText('Segunda pergunta');
    await expectSameEditor(page, tokens);

    await typeUnsent(page, 'theta');
    tokens.push('theta');
    await questions(page)
      .getByRole('listitem')
      .filter({ hasText: 'Segunda pergunta' })
      .getByRole('button', { name: 'Editar' })
      .click();
    await questions(page).locator('textarea').first().fill('Segunda pergunta editada?');
    await questions(page).getByRole('button', { name: 'Salvar' }).click();
    await expect(questions(page).getByText('Segunda pergunta editada?')).toBeVisible();
    await expectSameEditor(page, tokens);

    await typeUnsent(page, 'iota');
    tokens.push('iota');
    await questions(page)
      .getByRole('listitem')
      .filter({ hasText: 'Segunda pergunta editada' })
      .getByRole('button', { name: 'Remover' })
      .click();
    await expect(questions(page).getByText('Segunda pergunta editada?')).toHaveCount(0);
    await expectSameEditor(page, tokens);

    // 4. Faixa de capítulos.
    await typeUnsent(page, 'kappa');
    tokens.push('kappa');
    const to = page.getByRole('textbox', { name: 'Até o capítulo' });
    const from = Number(await page.getByRole('textbox', { name: 'Do capítulo' }).inputValue());
    await to.fill(String(from + 3));
    await to.press('Tab');
    await expect(to).toHaveValue(String(from + 3));
    await expectSameEditor(page, tokens);

    // 5. Visibilidade, comentários abertos e nota.
    await typeUnsent(page, 'lambda');
    tokens.push('lambda');
    await page.getByRole('radio', { name: /Só para membros/ }).check();
    await page.getByRole('switch', { name: 'Abrir comentários' }).click();
    await expectSameEditor(page, tokens);

    await typeUnsent(page, 'mi');
    tokens.push('mi');
    await page.getByRole('slider', { name: 'Impressão até aqui' }).fill('4');
    await expectSameEditor(page, tokens);

    // Tudo chega ao banco, inclusive o texto digitado entre as ações. E, com tudo assentado, o editor
    // continua sendo o mesmo (uma tela refeita tarde, depois da resposta do servidor, também falharia aqui).
    await expect(saved(page)).toBeVisible();
    await expectSameEditor(page, tokens);
    await expect
      .poll(() => sql(`select body::text from public.reading_sessions where id = ${lit(draftId)};`))
      .toContain('mi');
    const row = sql(
      `select body::text || '|' || visibility || '|' || comments_open || '|' || rating from public.reading_sessions where id = ${lit(draftId)};`,
    );
    for (const token of tokens) expect(row).toContain(token);
    expect(row).toMatch(/\|members\|false\|4/);
    expect(
      sql(`select count(*) from public.session_notes where session_id = ${lit(draftId)};`),
    ).toBe('1');
    expect(
      sql(`select count(*) from public.session_questions where session_id = ${lit(draftId)};`),
    ).toBe('1');

    // Recarregar na mesma URL abre o mesmo rascunho (e não a tela "Você já tem um rascunho").
    await page.reload();
    await expect(page.getByLabel('Título da sessão')).toHaveValue('Rascunho das ações');
    await expect(editorOf(page)).toContainText('mi');
  });

  test('rascunho aberto direto em /painel/sessoes/<id>: o mesmo vale', async ({ openAs }) => {
    const { page } = await openAs(admin);
    await page.goto(`/painel/sessoes/${draftId}`);
    await expect(editorOf(page)).toHaveAttribute('contenteditable', 'true');
    await untilHydrated(page.getByLabel('Título da sessão'));
    await mark(page);
    await typeUnsent(page, 'omega');
    await addNote(page, 'Trecho do rascunho aberto direto.');
    await expectSameEditor(page, ['omega']);
  });
});
