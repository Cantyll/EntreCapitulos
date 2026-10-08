import type { Locator, Page } from '@playwright/test';

import { lit, sql } from '../support/db';
import { expect, test } from '../support/fixtures';
import { createAdmin, createUser } from '../support/users';
import { WORLD, claimPoolSlot, sessionPath } from '../support/world';

/**
 * Texto real no limite: o que vem do painel ou de quem comenta (título de livro com uma palavra enorme, link colado
 * na sinopse, nome de 60 letras sem espaço) não pode deixar a página mais larga que a tela, e os campos de escrita
 * sem moldura precisam mostrar onde está o foco.
 */
const LONG_WORD = 'Pneumoultramicroscopicossilicovulcanoconiótico';
const LINK =
  'https://www.exemplo.com.br/um/caminho/muito/longo/sem/espaco/nenhum/no/meio?utm_source=whatsapp&utm_medium=grupo';
const LONG_NAME = 'AnaCarolinaAlbuquerqueVasconcellosCavalcantiPessoaLeitora123';
const BOOK_TITLE = `O inverno das mulheres que esqueceram o próprio nome ${LONG_WORD} e outras histórias 📚`;

/** Largura do documento contra a largura pedida: no celular emulado a página "encolhe" em vez de rolar de lado. */
async function expectFitsWidth(page: Page, label: string) {
  const width = page.viewportSize()!.width;
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${label}: largura do documento`).toBeLessThanOrEqual(width);
}

/** Contraste WCAG entre a cor do placeholder do campo e o fundo do cartão em volta. */
async function placeholderContrast(field: Locator, surface: Locator): Promise<number> {
  const colors = await Promise.all([
    field.evaluate((el) => getComputedStyle(el, '::placeholder').color),
    surface.evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);
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
  const [a, b] = colors.map(luminance) as [number, number];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.describe('textos longos no celular de 320px @mobile', () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test('livro e sessão com título, link e nome enormes não alargam a página', async ({ page }) => {
    const slot = claimPoolSlot();
    const reader = await createUser({ name: LONG_NAME });
    const session = `(select s.id from public.reading_sessions s join public.books b on b.id = s.book_id
      where b.slug = ${lit(slot.slug)} and s.number = ${slot.sessionNumber})`;
    // Antes da primeira visita a este livro: o app guarda livro e sessão em cache (ver e2e/support/world.ts).
    sql(`
      update public.books set title = ${lit(BOOK_TITLE)},
        synopsis = ${lit(`Sinopse com o endereço ${LINK} colado no meio.`)},
        genres = array[${lit(LONG_WORD)}]
      where slug = ${lit(slot.slug)};
      update public.reading_sessions set
        title = ${lit(`Quando o ${LONG_WORD} encontrou a carta`)},
        body = jsonb_set(body, '{content}', (body->'content') || jsonb_build_array(
          jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', ${lit(`Link colado: ${LINK}`)})))))
      where id = ${session};
      insert into public.session_notes (session_id, kind, text, reference, position)
        values (${session}, 'quote', ${lit(LINK)}, ${lit(`Capítulo 3, ${LONG_WORD}`)}, 10);
      insert into public.session_questions (session_id, text, position)
        values (${session}, ${lit(`E se ${LONG_WORD}${LONG_WORD}?`)}, 10);
      insert into public.comments (session_id, author_id, body, read_up_to, status)
        values (${session}, ${lit(reader.id)}, ${lit(`${LINK}\n${'k'.repeat(300)}`)}, 3, 'approved');
    `);

    await page.goto(`/livros/${slot.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: BOOK_TITLE })).toBeVisible();
    await expectFitsWidth(page, 'página do livro');

    await page.goto(slot.sessionPath);
    // O botão de volta encolhe com reticências, mas o nome acessível continua com o título inteiro.
    await expect(page.getByRole('link', { name: `Voltar para ${BOOK_TITLE}` })).toBeVisible();
    await expect(page.getByText(LONG_NAME).first()).toBeVisible();
    await expectFitsWidth(page, 'página da sessão');
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
});
