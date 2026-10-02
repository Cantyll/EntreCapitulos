import type { Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { createUser } from '../support/users';
import { OPENING_TEXT, WORLD, chapterText, chapterTitle, sessionPath } from '../support/world';

const SEED_BOOK = '/livros/o-livro-de-azrael';
const { readingSlug, sessions } = WORLD;

/** O capítulo coberto fica `inert` e borrado (o texto continua no HTML: é cortesia, não trava). */
const covered = (page: Page, chapter: number) => page.locator(`#ch-${chapter} [inert]`);

test.describe('visitante', () => {
  test('a home mostra o livro atual @mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'O Livro de Azrael' })).toBeVisible();
    await expect(page.getByText('Lendo agora').first()).toBeVisible();
  });

  test('a página do livro tem a fita de capítulos com links e nomes acessíveis @mobile', async ({
    page,
  }) => {
    await page.goto(SEED_BOOK);
    await expect(page.getByRole('heading', { level: 1, name: 'O Livro de Azrael' })).toBeVisible();
    const link = page.getByRole('link', { name: 'Capítulo 1, sessão 1' }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/livros\/o-livro-de-azrael\/sessoes\/1$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Primeiras impressões: Dianna' }),
    ).toBeVisible();
  });

  test('progresso desconhecido cobre os capítulos, pede o progresso e deixa a abertura visível @mobile', async ({
    page,
  }) => {
    await page.goto(sessionPath(readingSlug, sessions.public.number));

    await expect(page.getByText('Até que capítulo você leu?').first()).toBeVisible();
    await expect(page.getByText(OPENING_TEXT)).toBeVisible();
    for (const chapter of [1, 2, 3]) {
      await expect(
        page.getByRole('button', { name: `Mostrar o capítulo ${chapter} mesmo assim` }),
      ).toBeVisible();
      await expect(covered(page, chapter)).toHaveCount(1);
    }
    // Capítulo coberto: o título dele nem é desenhado.
    await expect(page.getByText(chapterTitle(1))).toHaveCount(0);

    // Escolher o progresso descobre os capítulos até ele; o resto continua coberto.
    await page.getByLabel('Li até o').first().selectOption({ label: 'Capítulo 2' });
    await expect(page.getByRole('heading', { name: new RegExp(chapterTitle(1)) })).toBeVisible();
    await expect(covered(page, 1)).toHaveCount(0);
    await expect(covered(page, 2)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Mostrar o capítulo 3 mesmo assim' }),
    ).toBeVisible();
    await expect(covered(page, 3)).toHaveCount(1);

    // Revelar um capítulo mesmo assim.
    await page.getByRole('button', { name: 'Mostrar o capítulo 3 mesmo assim' }).click();
    await expect(covered(page, 3)).toHaveCount(0);
    await expect(page.getByText(chapterText(3))).toBeVisible();
    await expect(page.getByRole('heading', { name: new RegExp(chapterTitle(3)) })).toBeVisible();
  });

  test('sessão só para membros pede login ao visitante', async ({ page, guard }) => {
    guard.allowStatus(404);
    await page.goto(sessionPath(readingSlug, sessions.members.number));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Entre para continuar' }),
    ).toBeVisible();
    await expect(page.getByText(sessions.members.title)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Entrar' }).last()).toHaveAttribute(
      'href',
      /\/entrar\?next=/,
    );
  });

  test('rascunho é invisível: o visitante vê o mesmo que numa sessão inexistente, e quem está logado vê 404', async ({
    page,
    openAs,
    guard,
  }) => {
    guard.allowStatus(404);
    const path = sessionPath(readingSlug, sessions.draft.number);
    await page.goto(path);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Entre para continuar' }),
    ).toBeVisible();
    await expect(page.getByText(sessions.draft.title)).toHaveCount(0);

    const { page: member } = await openAs(await createUser());
    const response = await member.goto(path);
    expect(response?.status()).toBe(404);
    await expect(member.getByText(sessions.draft.title)).toHaveCount(0);
  });

  test('404 em português @mobile', async ({ page, guard }) => {
    guard.allowStatus(404);
    const response = await page.goto('/uma-pagina-que-nao-existe');
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Não encontramos esta página' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Voltar para o início' })).toBeVisible();

    // As Links da página (cabeçalho, rodapé) já começaram a buscar a próxima tela (prefetch). Navegar com
    // essas buscas no ar faz o WebKit cancelá-las e relatar "Fetch API cannot load … access control
    // checks" como erro não tratado: espera a rede assentar antes de sair da página.
    await page.waitForLoadState('networkidle');
    const book = await page.goto('/livros/livro-que-nao-existe');
    expect(book?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
