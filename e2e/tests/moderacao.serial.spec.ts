import { lit, sql } from '../support/db';
import { expect, test } from '../support/fixtures';
import { createModerator, createUser } from '../support/users';
import { WORLD, poolSlug } from '../support/world';

/**
 * A fila "Para aprovar" é global (todos os testes deixam itens pendentes) e a aprovação em lote age
 * sobre a página visível, então estes testes rodam em série e começam esvaziando a fila por SQL.
 */
test.describe.serial('moderação', () => {
  test('a moderadora só acessa Comentários (403 no resto)', async ({ openAs, guard }) => {
    guard.allowStatus(403);
    const { page } = await openAs(await createModerator());

    await page.goto('/painel');
    await expect(page).toHaveURL(/\/painel\/comentarios/);
    await expect(page.getByRole('link', { name: /^Comentários/ }).first()).toBeVisible();

    for (const path of [
      '/painel/livros',
      '/painel/sessoes',
      '/painel/sessoes/nova',
      '/painel/membros',
      '/painel/votacoes',
      '/painel/configuracoes',
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(403);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Você não tem acesso a esta página' }),
      ).toBeVisible();
    }
  });

  test('aprovar em lote aprova só os itens visíveis e sem alerta', async ({ openAs }) => {
    // Fila vazia e 25 pendentes de um autor, com um alerta entre os 20 primeiros.
    sql(`update public.comments set status = 'removed' where status = 'pending';`);
    const author = await createUser({ name: 'Autor do Lote' });
    const sessionId = sql(
      `select s.id from public.reading_sessions s join public.books b on b.id = s.book_id where b.slug = ${lit(poolSlug(WORLD.poolSize))};`,
    );
    sql(`
      insert into public.comments (session_id, author_id, body, read_up_to, status, created_at)
      select ${lit(sessionId)}, ${lit(author.id)}, 'lote-' || g, 0, 'pending', now() + (g * interval '1 second')
        from generate_series(1, 25) g;
      insert into public.comment_flags (comment_id, reason)
      select id, 'Contém link' from public.comments where body = 'lote-5' and author_id = ${lit(author.id)};
    `);

    const { page } = await openAs(await createModerator());
    await page.goto('/painel/comentarios?aba=pendentes');
    const items = page.locator('li[id^="moderar-"]');
    await expect(items).toHaveCount(20);
    const visibleIds = await items.evaluateAll((nodes) =>
      nodes.map((n) => n.id.replace('moderar-', '')),
    );
    const flagged = page.locator('li[id^="moderar-"]', { hasText: 'lote-5' });
    await expect(flagged.getByText('Alerta: Contém link')).toBeVisible();

    await page.getByRole('button', { name: 'Aprovar os 19 desta página sem alerta' }).click();
    await expect(page.getByRole('status').filter({ hasText: /19/ })).toBeVisible();

    const inList = visibleIds.map(lit).join(', ');
    // Os 19 visíveis sem alerta foram aprovados.
    expect(
      sql(`select count(*) from public.comments where id in (${inList}) and status = 'approved';`),
    ).toBe('19');
    // O que tem alerta continua para a moderadora decidir, e o que não estava na página nem foi tocado.
    expect(
      sql(
        `select count(*) from public.comments where author_id = ${lit(author.id)} and status = 'pending';`,
      ),
    ).toBe('6');
    expect(
      sql(
        `select status from public.comments where body = 'lote-5' and author_id = ${lit(author.id)};`,
      ),
    ).toBe('pending');
  });
});
