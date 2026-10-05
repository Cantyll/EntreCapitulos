import { lit, sql, sqlNumber } from '../support/db';
import { expect, test } from '../support/fixtures';
import { createBulkMembers, readStats, suspendBySql, unique } from '../support/members';
import { createAdmin, createModerator, createUser } from '../support/users';

/*
 * Gestão de membros que depende do estado GLOBAL do banco (os números do topo, a paginação com mais de 25
 * contas e os filtros): roda em série, depois dos outros projetos, e acha as contas deste teste pelo prefixo.
 */
test.describe.serial('membros (estado global)', () => {
  test('os quatro números do topo são os que o banco conta', async ({ openAs }) => {
    // Garante um de cada: equipe (a própria administração), suspenso e novo.
    const suspended = await createUser({ name: unique('Numero') });
    suspendBySql(suspended.id);
    const { page } = await openAs(await createAdmin());
    await page.goto('/painel/membros');

    const stats = await readStats(page);
    expect(stats).toEqual({
      Membros: sqlNumber('select count(*) from public.profiles;'),
      Equipe: sqlNumber(
        "select count(*) from public.profiles where role in ('admin', 'moderator');",
      ),
      'Comentários suspensos': sqlNumber('select count(*) from public.member_suspensions;'),
      'Novos em 7 dias': sqlNumber(
        "select count(*) from public.profiles where created_at >= now() - interval '7 days';",
      ),
    });
    expect(stats['Comentários suspensos']).toBeGreaterThanOrEqual(1);
    // Os filtros repetem os mesmos números ao lado do nome.
    const filters = page.getByRole('navigation', { name: 'Filtrar membros' });
    await expect(filters.getByRole('link', { name: /^Todos/ })).toContainText(
      stats.Membros!.toLocaleString('pt-BR'),
    );
    await expect(filters.getByRole('link', { name: /^Suspensos/ })).toContainText(
      stats['Comentários suspensos']!.toLocaleString('pt-BR'),
    );
  });

  test('paginação: 25 por página, página inválida volta à primeira e além da última vai para a última', async ({
    openAs,
  }) => {
    const token = unique('Pag');
    createBulkMembers(`Pag${token}`, 27, token);
    const { page } = await openAs(await createAdmin());
    const rows = page.locator('[data-tour="members-table"] a:visible');
    const base = `/painel/membros?busca=${encodeURIComponent(`Pag${token}`)}`;

    await page.goto(base);
    await expect(rows).toHaveCount(25);
    await expect(page.getByText('Página 1 de 2')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Página anterior' })).toHaveCount(0);
    const next = page.getByRole('link', { name: 'Próxima página' });
    // A busca por nome continua nos links da paginação (e nenhum e-mail entra na URL).
    await expect(next).toHaveAttribute('href', /busca=Pag/);
    await next.click();
    await expect(page).toHaveURL(/pagina=2/);
    await expect(rows).toHaveCount(2);
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Próxima página' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Página anterior' }).click();
    await expect(rows).toHaveCount(25);

    // Valores estranhos nunca quebram: voltam à primeira (e uma página que passa do fim vai para a última).
    for (const value of ['abc', '0', '-3', '1.5', '999999999']) {
      await page.goto(`${base}&pagina=${value}`);
      await expect(rows, `pagina=${value}`).toHaveCount(25);
    }
    await page.goto(`${base}&pagina=99999`);
    await expect(page).toHaveURL(/pagina=2/);
    await expect(rows).toHaveCount(2);
  });

  test('filtros Todos, Equipe, Suspensos e Novos, com a busca por nome junto', async ({
    openAs,
  }) => {
    const token = unique('Filtro');
    const staff = await createModerator({ name: `${token} Equipe` });
    const member = await createUser({ name: `${token} Membro` });
    const suspended = await createUser({ name: `${token} Suspensa` });
    const old = await createUser({ name: `${token} Antiga` });
    suspendBySql(suspended.id);
    sql(
      `update public.profiles set created_at = now() - interval '30 days' where id = ${lit(old.id)};`,
    );
    void staff;
    void member;

    const { page } = await openAs(await createAdmin());
    const names = async (filter: string) => {
      await page.goto(
        `/painel/membros?busca=${encodeURIComponent(token)}${filter ? `&filtro=${filter}` : ''}`,
      );
      await expect(page.locator('main')).toBeVisible();
      return (await page.locator('[data-tour="members-table"] a:visible').allTextContents())
        .map((text) => text.replace(`${token} `, ''))
        .sort();
    };

    expect(await names('')).toEqual(['Antiga', 'Equipe', 'Membro', 'Suspensa']);
    expect(await names('equipe')).toEqual(['Equipe']);
    expect(await names('suspensos')).toEqual(['Suspensa']);
    // "Novos": quem entrou nos últimos 7 dias (a conta de 30 dias fica de fora).
    expect(await names('novos')).toEqual(['Equipe', 'Membro', 'Suspensa']);
    await expect(
      page
        .getByRole('navigation', { name: 'Filtrar membros' })
        .getByRole('link', { name: /^Novos/ }),
    ).toHaveAttribute('aria-current', 'page');
    // A situação aparece na lista.
    await page.goto(`/painel/membros?busca=${encodeURIComponent(token)}&filtro=suspensos`);
    await expect(
      page.locator('[data-tour="members-table"]').getByText('Suspenso').filter({ visible: true }),
    ).toHaveCount(1);
    // Filtro sem ninguém: texto vazio, sem tabela.
    await page.goto(`/painel/membros?busca=${encodeURIComponent(`${token}ZZZ`)}`);
    await expect(page.getByText('Nenhuma pessoa com esse começo de nome')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
  });
});
