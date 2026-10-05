import { lit, sql } from '../support/db';
import { expect, test } from '../support/fixtures';
import { untilHydrated } from '../support/hydration';
import { createAdmin, createUser } from '../support/users';
import { claimPoolSlot } from '../support/world';

/** Comentário inserido direto no banco (aprovado), numa sessão do pool: só prepara dados para o teste. */
function insertComment(options: {
  slug: string;
  authorId: string;
  body: string;
  parentId?: string;
}): string {
  return sql(
    `insert into public.comments (session_id, author_id, parent_id, body, read_up_to, status)
     select s.id, ${lit(options.authorId)}, ${options.parentId ? lit(options.parentId) : 'null'}, ${lit(options.body)}, 0, 'approved'
       from public.reading_sessions s join public.books b on b.id = s.book_id where b.slug = ${lit(options.slug)}
     returning id;`,
  ).split('\n')[0]!;
}

test.describe('minha conta', () => {
  test('editar o nome atualiza o cabeçalho @mobile', async ({ signedIn }) => {
    const { page, user } = await signedIn({ name: 'Nome Antigo' });
    await page.goto('/conta');
    await expect(page.getByText(user.email)).toBeVisible();
    const field = page.getByLabel('Nome que aparece nos seus comentários');
    await untilHydrated(field);
    await field.fill('Nome Novo');
    await page.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(page.getByRole('button', { name: 'Menu da conta de Nome Novo' })).toBeVisible();
    expect(sql(`select display_name from public.profiles where id = ${lit(user.id)};`)).toBe(
      'Nome Novo',
    );
  });

  test('baixar meus dados entrega um JSON só com dados da própria pessoa', async ({ signedIn }) => {
    const { slug } = claimPoolSlot();
    const { page, user } = await signedIn({ name: 'Quem Baixa' });
    const other = await createUser({ name: 'Outra Pessoa' });
    const mine = `Meu comentário ${Date.now()}`;
    const theirs = `Comentário de outra pessoa ${Date.now()}`;
    insertComment({ slug, authorId: user.id, body: mine });
    insertComment({ slug, authorId: other.id, body: theirs });

    await page.goto('/conta');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: /Baixar/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    const response = await page.request.get('/conta/dados');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-disposition']).toMatch(/attachment/);
    expect(response.headers()['cache-control']).toMatch(/no-store/);
    const text = await response.text();
    expect(text).toContain(mine);
    expect(text).toContain(user.email);
    // Nada de terceiros: nem o comentário nem o e-mail nem o id de outra pessoa; nem alertas da moderação.
    expect(text).not.toContain(theirs);
    expect(text).not.toContain(other.email);
    expect(text).not.toContain(other.id);
    expect(text).not.toMatch(/comment_flags|Contém link/);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  test('visitante recebe 401 no download dos dados', async ({ request }) => {
    const response = await request.get('/conta/dados');
    expect(response.status()).toBe(401);
  });

  test('excluir a conta apaga a pessoa, os comentários e as respostas de outras pessoas a eles', async ({
    signedIn,
  }) => {
    const { slug } = claimPoolSlot();
    const { page, user } = await signedIn({ name: 'Quem Sai' });
    const other = await createUser({ name: 'Quem Fica' });
    const parent = insertComment({ slug, authorId: user.id, body: 'Comentário de quem vai sair' });
    const reply = insertComment({
      slug,
      authorId: other.id,
      parentId: parent,
      body: 'Resposta de quem fica',
    });
    sql(
      `insert into public.reading_progress (user_id, book_id, chapter) select ${lit(user.id)}, id, 2 from public.books where slug = ${lit(slug)};`,
    );

    await page.goto('/conta');
    const field = page.getByLabel(/Para confirmar, digite/);
    await untilHydrated(field);
    const button = page.getByRole('button', { name: 'Excluir minha conta para sempre' });
    await expect(button).toBeDisabled();
    await field.fill('EXCLUIR');
    await button.click();
    await expect(page).toHaveURL(/\/conta\/excluida$/);

    expect(sql(`select count(*) from auth.users where id = ${lit(user.id)};`)).toBe('0');
    expect(sql(`select count(*) from public.profiles where id = ${lit(user.id)};`)).toBe('0');
    expect(sql(`select count(*) from public.comments where id = ${lit(parent)};`)).toBe('0');
    expect(
      sql(`select count(*) from public.reading_progress where user_id = ${lit(user.id)};`),
    ).toBe('0');
    // A resposta de outra pessoa ao comentário apagado vai junto (decisão conhecida); a pessoa fica.
    expect(sql(`select count(*) from public.comments where id = ${lit(reply)};`)).toBe('0');
    expect(sql(`select count(*) from public.profiles where id = ${lit(other.id)};`)).toBe('1');

    // Sem sessão: /conta pede login de novo.
    await page.goto('/conta');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('conta da equipe não tem o formulário de exclusão e explica a etapa a mais', async ({
    openAs,
  }) => {
    const { page } = await openAs(await createAdmin());
    await page.goto('/conta');
    await expect(page.getByText(/contas da equipe não podem ser excluídas por aqui/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Excluir minha conta para sempre' })).toHaveCount(
      0,
    );
  });

  test('se o papel de equipe chegar com a tela aberta, o servidor recusa a exclusão e nada é apagado', async ({
    signedIn,
  }) => {
    const { page, user } = await signedIn();
    await page.goto('/conta');
    const field = page.getByLabel(/Para confirmar, digite/);
    await untilHydrated(field);
    // A tela ainda mostra o formulário de membro, mas a pessoa virou moderação no banco.
    sql(`update public.profiles set role = 'moderator' where id = ${lit(user.id)};`);
    await field.fill('EXCLUIR');
    await page.getByRole('button', { name: 'Excluir minha conta para sempre' }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Contas da equipe não podem ser excluídas por aqui' }),
    ).toBeVisible();
    expect(sql(`select count(*) from auth.users where id = ${lit(user.id)};`)).toBe('1');
  });
});
