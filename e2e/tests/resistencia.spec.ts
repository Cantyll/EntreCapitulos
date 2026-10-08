import type { Locator, Page } from '@playwright/test';

import { lit, sql } from '../support/db';
import { expect, test } from '../support/fixtures';
import { createAdmin, createUser } from '../support/users';
import { LONG_TEXT, WORLD, sessionPath } from '../support/world';

/**
 * Texto real no limite (o livro `WORLD.longSlug`, criado com o mundo) não pode deixar a página mais larga que a
 * tela, e os campos de escrita sem moldura precisam mostrar onde está o foco.
 */

/** Largura do documento contra a largura pedida: no celular emulado a página "encolhe" em vez de rolar de lado. */
async function expectFitsWidth(page: Page, label: string) {
  const width = page.viewportSize()!.width;
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${label}: largura do documento`).toBeLessThanOrEqual(width);
}

/** Contraste WCAG entre duas cores do `getComputedStyle` (`rgb(...)`). */
function contrastRatio(first: string, second: string): number {
  const luminance = (css: string) => {
    const [r, g, b] = css
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number) as [number, number, number];
    const lin = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const [a, b] = [luminance(first), luminance(second)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Contraste entre a cor do placeholder do campo e o fundo do cartão em volta. */
async function placeholderContrast(field: Locator, surface: Locator): Promise<number> {
  const [text, background] = await Promise.all([
    field.evaluate((el) => getComputedStyle(el, '::placeholder').color),
    surface.evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);
  return contrastRatio(text, background);
}

test.describe('textos longos no celular de 320px @mobile', () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test('livro e sessão com título, link e nome enormes não alargam a página', async ({ page }) => {
    const reader = await createUser({ name: LONG_TEXT.name });
    // Os comentários da sessão só entram em cache na primeira visita a ela, e só este teste a visita.
    sql(`
      insert into public.comments (session_id, author_id, body, read_up_to, status)
      select s.id, ${lit(reader.id)}, ${lit(`${LONG_TEXT.link}\n${'k'.repeat(300)}`)}, 3, 'approved'
        from public.reading_sessions s join public.books b on b.id = s.book_id
       where b.slug = ${lit(WORLD.longSlug)} and s.number = 1;
    `);

    await page.goto(`/livros/${WORLD.longSlug}`);
    await expect(page.getByRole('heading', { level: 1, name: LONG_TEXT.bookTitle })).toBeVisible();
    await expectFitsWidth(page, 'página do livro');

    await page.goto(sessionPath(WORLD.longSlug, 1));
    // O botão de volta encolhe com reticências, mas o nome acessível continua com o título inteiro.
    await expect(
      page.getByRole('link', { name: `Voltar para ${LONG_TEXT.bookTitle}` }),
    ).toBeVisible();
    await expect(page.getByText(LONG_TEXT.name).first()).toBeVisible();
    await expectFitsWidth(page, 'página da sessão');
  });

  test('as páginas públicas cabem em 320px', async ({ page }) => {
    for (const path of ['/', '/sessoes', '/estante', '/sobre', '/livros/o-livro-de-azrael']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectFitsWidth(page, path);
    }
  });
});

test.describe('campos de escrita: foco e placeholder', () => {
  test('o cartão do comentário acende com o foco e o placeholder passa 4,5:1', async ({
    openAs,
  }) => {
    const { page } = await openAs(await createUser());
    await page.goto(sessionPath(WORLD.readingSlug, WORLD.sessions.public.number));
    const field = page.getByLabel('Seu comentário');
    const card = page.locator('[class*="composer"]');
    await expect(field).toBeVisible();
    expect(await placeholderContrast(field, card)).toBeGreaterThanOrEqual(4.5);
    await expect(card).toHaveCSS('outline-style', 'none');
    await field.focus();
    await expect(card).toHaveCSS('outline-style', 'solid');
    await expect(card).toHaveCSS('outline-width', '2px');
  });

  test('o papel do relato acende com o foco e o título vazio é legível', async ({ openAs }) => {
    test.slow();
    const { page } = await openAs(await createAdmin());
    await page.goto('/painel/sessoes/nova');
    const title = page.getByLabel('Título da sessão');
    await expect(title).toBeVisible();
    expect(await placeholderContrast(title, page.locator('body'))).toBeGreaterThanOrEqual(4.5);
    // Só o foco, sem digitar: digitar criaria um rascunho (estado global do banco).
    const body = page.getByRole('textbox', { name: 'Relato da sessão' });
    const paper = page.locator('[class*="paper"]').filter({ has: body });
    await body.focus();
    await expect(paper).toHaveCSS('outline-style', 'solid');
    await expect(paper).toHaveCSS('outline-width', '2px');
  });

  test('a borda de baixo dos campos com moldura passa 3:1 (linha de pauta)', async ({ page }) => {
    await page.goto(sessionPath(WORLD.readingSlug, WORLD.sessions.public.number));
    const select = page.getByLabel('Li até o').first();
    await expect(select).toBeVisible();
    const [rule, side, background] = await select.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.borderBottomColor, style.borderTopColor, style.backgroundColor];
    });
    expect(contrastRatio(rule, background)).toBeGreaterThanOrEqual(3);
    // Os outros lados continuam na Pauta clara: só a linha de baixo mudou.
    expect(contrastRatio(side, background)).toBeLessThan(3);
  });
});
