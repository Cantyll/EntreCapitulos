import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

import { lit, sql, sqlNumber } from '../support/db';
import { expect, test } from '../support/fixtures';
import { untilHydrated } from '../support/hydration';
import {
  auditCount,
  insertComment,
  isSuspended,
  roleOf,
  suspendBySql,
  unique,
} from '../support/members';
import { createAdmin, createModerator, createUser } from '../support/users';
import { claimPoolSlot } from '../support/world';

/*
 * Gestão de membros (etapa 8f). Cada teste cria as próprias contas com nomes únicos e acha as pessoas pela busca
 * por nome (a lista de membros é global e cresce com os outros testes). O que depende dos números globais, da
 * paginação com 26 ou mais contas e dos filtros fica em `membros.serial.spec.ts`.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const serious = (violations: { impact?: string | null }[]) =>
  violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

const profilePath = (id: string) => `/painel/membros/${id}`;
const listPath = (name: string) => `/painel/membros?busca=${encodeURIComponent(name)}`;

/** Pessoas e controles do perfil. */
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function openProfile(page: Page, id: string) {
  await page.goto(profilePath(id));
  await untilHydrated(button(page, 'Mostrar e-mail'));
}

test.describe('acesso', () => {
  test('moderação e membro recebem 403 na lista e no perfil; visitante vai para o login', async ({
    openAs,
    page: visitor,
    guard,
  }) => {
    guard.allowStatus(403);
    const target = await createUser({ name: unique('Alvo') });
    for (const user of [await createModerator(), await createUser()]) {
      const { page } = await openAs(user);
      for (const path of ['/painel/membros', profilePath(target.id)]) {
        const response = await page.goto(path);
        expect(response?.status(), `${user.role} ${path}`).toBe(403);
        await expect(
          page.getByRole('heading', { level: 1, name: 'Você não tem acesso a esta página' }),
        ).toBeVisible();
      }
    }
    await visitor.goto('/painel/membros');
    await expect(visitor).toHaveURL(/\/entrar/);
  });

  test('id inválido ou de quem não existe: 404 em português, dentro do painel', async ({
    openAs,
    guard,
  }) => {
    guard.allowStatus(404);
    const { page } = await openAs(await createAdmin());
    for (const id of ['nao-e-um-uuid', '00000000-0000-4000-8000-00000000dead']) {
      const response = await page.goto(profilePath(id));
      expect(response?.status(), id).toBe(404);
      await expect(
        page.getByRole('heading', { name: 'Não encontramos esta pessoa' }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Voltar para Membros' }).first()).toBeVisible();
    }
  });

  test('o download só aceita POST do próprio site, de administração, com cabeçalhos de anexo', async ({
    openAs,
    request,
    guard,
  }) => {
    guard.allowStatus(403, 405);
    const target = await createUser({ name: unique('Baixa') });
    const { page } = await openAs(await createAdmin());
    await page.goto('/painel/membros');
    const origin = new URL(page.url()).origin;
    const url = `${profilePath(target.id)}/dados`;

    // GET nunca baixa (nem grava auditoria): a rota só existe para POST.
    expect((await page.request.get(url)).status()).toBe(405);
    // Sem Origin ou de outro site: recusado antes de qualquer leitura.
    expect((await page.request.post(url)).status()).toBe(403);
    expect(
      (await page.request.post(url, { headers: { origin: 'https://outro.exemplo' } })).status(),
    ).toBe(403);
    expect(auditCount(target.id, 'export_data')).toBe(0);
    // Sem sessão: vai para o login (o proxy responde antes da rota).
    const anonymous = await request.post(url, { maxRedirects: 0, headers: { origin } });
    expect([302, 303, 307, 308]).toContain(anonymous.status());
    // Moderação: 403.
    const { page: moderator } = await openAs(await createModerator());
    await moderator.goto('/painel/comentarios');
    expect((await moderator.request.post(url, { headers: { origin } })).status()).toBe(403);
    expect(auditCount(target.id, 'export_data')).toBe(0);

    // Administração, do próprio site: anexo, sem cache, nome sem nome nem e-mail, e a auditoria entra.
    const ok = await page.request.post(url, { headers: { origin } });
    expect(ok.status()).toBe(200);
    expect(ok.headers()['cache-control']).toBe('no-store');
    expect(ok.headers()['content-disposition']).toMatch(
      new RegExp(
        `^attachment; filename="dados-${target.id.slice(0, 8)}-\\d{4}-\\d{2}-\\d{2}\\.json"$`,
      ),
    );
    expect(ok.headers()['content-disposition']).not.toMatch(/@|Baixa/);
    expect(auditCount(target.id, 'export_data')).toBe(1);
  });
});

test.describe('lista', () => {
  test('mostra só o e-mail MASCARADO e acha a pessoa pelo começo do nome', async ({ openAs }) => {
    const token = unique('Mascara');
    const person = await createUser({ name: `${token} Silva` });
    const { page } = await openAs(await createAdmin());
    await page.goto(listPath(token.slice(0, 12)));

    const row = page.locator('[data-tour="members-table"]');
    await expect(row.getByRole('link', { name: `${token} Silva` })).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(person.email);
    // O mascarado: primeira letra + "***" + domínio.
    const masked = `${person.email[0]}***@teste.example`;
    expect(await page.locator('main').innerText()).toContain(masked);
    await expect(page).toHaveURL(/busca=/);
    expect(page.url()).not.toContain('@');
  });

  test('a busca por nome trata % e _ como letras comuns', async ({ openAs }) => {
    const token = unique('Curinga');
    await createUser({ name: `${token}%a` });
    await createUser({ name: `${token}xa` });
    await createUser({ name: `${token}_b` });
    await createUser({ name: `${token}yb` });
    const { page } = await openAs(await createAdmin());

    await page.goto(listPath(`${token}%`));
    const rows = page.locator('[data-tour="members-table"] a:visible');
    await expect(rows).toHaveText([`${token}%a`]);
    await page.goto(listPath(`${token}_`));
    await expect(rows).toHaveText([`${token}_b`]);
    await page.goto(listPath(token));
    await expect(rows).toHaveCount(4);
  });

  test('busca por e-mail exato: abre o perfil, nunca põe o e-mail na URL e limpa o campo', async ({
    openAs,
  }) => {
    const person = await createUser({ name: unique('PorEmail') });
    const { page } = await openAs(await createAdmin());
    await page.goto('/painel/membros');
    const field = page.getByRole('textbox', { name: /Buscar por nome ou por e-mail exato/ });
    await untilHydrated(field);

    // Sem caixa e com espaços nas pontas.
    await field.fill(`  ${person.email.toUpperCase()}  `);
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/painel/membros/${person.id}$`));
    expect(page.url()).not.toContain('@');
    expect(decodeURIComponent(page.url())).not.toContain('teste.example');

    // E-mail que não existe: mensagem fixa, sem repetir o e-mail, e o campo volta vazio.
    await page.goto('/painel/membros');
    await untilHydrated(field);
    await field.fill('ninguem.assim@teste.example');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Nenhuma pessoa com esse e-mail.' }),
    ).toBeVisible();
    await expect(field).toHaveValue('');
    expect(page.url()).not.toContain('@');
    expect(await page.locator('main').innerText()).not.toContain('ninguem.assim');
  });

  test('um e-mail na URL (?busca=) é ignorado: nunca vira busca por nome', async ({ openAs }) => {
    const person = await createUser({ name: unique('Ignora') });
    const { page } = await openAs(await createAdmin());
    await page.goto(`/painel/membros?busca=${encodeURIComponent(person.email)}`);
    await expect(page.getByText(/Nomes que começam com/)).toHaveCount(0);
    await expect(page.locator('[data-tour="members-table"]')).toBeVisible();
  });

  test('cada link e cada botão da página aparece uma só vez na árvore de acessibilidade, em cada largura', async ({
    openAs,
    browserName,
  }) => {
    test.slow();
    const token = unique('Arvore');
    await Promise.all([1, 2, 3].map((n) => createUser({ name: `${token} Pessoa ${n}` })));
    const { page } = await openAs(await createAdmin());

    for (const width of [320, 375, 390, 820, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(listPath(token));
      const region = page.locator('[data-tour="members-table"]');
      await expect(region).toBeVisible();

      // O desenho escondido não existe para a tecnologia assistiva (display:none): um só dos dois está na árvore.
      const cards = width <= 760;
      await expect(region.getByRole('table')).toHaveCount(cards ? 0 : 1);
      await expect(region.getByRole('list', { name: 'Membros do clube' })).toHaveCount(
        cards ? 1 : 0,
      );

      const snapshot = await region.ariaSnapshot();
      const links = [...snapshot.matchAll(/- link "([^"]+)"/g)].map((match) => match[1]);
      expect(links.sort(), `largura ${width}`).toEqual(
        [1, 2, 3].map((n) => `${token} Pessoa ${n}`).sort(),
      );
      expect(snapshot).not.toContain('button');

      // Na página inteira (busca, filtros, lista, paginação): nenhum link nem botão repetido.
      const main = await page.locator('main').ariaSnapshot();
      const seen = new Map<string, number>();
      for (const [, role, name] of main.matchAll(/- (link|button) "([^"]+)"/g)) {
        const key = `${role}:${name}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      expect(
        [...seen].filter(([, times]) => times > 1),
        `largura ${width}`,
      ).toEqual([]);

      // O teclado percorre cada pessoa uma vez (o WebKit do Safari não põe links na ordem do Tab).
      if (browserName === 'chromium') {
        const visible = region.locator('a:visible');
        await expect(visible).toHaveCount(3);
        const expected = await visible.allTextContents();
        await visible.first().focus();
        const visited: string[] = [];
        for (let i = 0; i < expected.length; i += 1) {
          visited.push(
            await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''),
          );
          if (i < expected.length - 1) await page.keyboard.press('Tab');
        }
        expect(visited, `largura ${width}`).toEqual(expected.map((name) => name.trim()));
      }

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
        `rolagem horizontal em ${width}px`,
      ).toBe(true);
    }
  });

  test('no celular a lista vira cartões e não há rolagem horizontal @mobile', async ({
    openAs,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'webkit-mobile',
      'os cartões e os alvos de toque são do celular',
    );
    const token = unique('Celular');
    await createUser({ name: `${token} Pessoa` });
    const { page } = await openAs(await createAdmin());
    await page.goto(listPath(token));
    const region = page.locator('[data-tour="members-table"]');
    await expect(region.getByRole('list', { name: 'Membros do clube' })).toBeVisible();
    await expect(region.locator('table')).toBeHidden();
    const link = region.getByRole('link', { name: `${token} Pessoa` });
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      serious((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations),
    ).toEqual([]);
  });

  test('alvos de toque de 44px na lista, no perfil e no diálogo @mobile', async ({
    openAs,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'webkit-mobile',
      'só o projeto de iPhone mede alvos de toque',
    );
    const token = unique('Toque');
    const person = await createUser({ name: `${token} Pessoa` });
    const { page } = await openAs(await createAdmin());

    // Botões, links isolados e campos visíveis da área principal (a barra do painel é de outra etapa).
    const smallTargets = () =>
      page.evaluate(() => {
        const out: string[] = [];
        const scope = document.querySelector('main') ?? document.body;
        const dialog = document.querySelector('dialog[open]');
        const roots = dialog ? [dialog] : [scope];
        for (const root of roots) {
          for (const element of root.querySelectorAll<HTMLElement>(
            'a[href], button, select, textarea, input:not([type=hidden])',
          )) {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            if (box.width === 0 || box.height === 0 || element.closest('[hidden]')) continue;
            // Link no meio de um texto fica de fora (WCAG 2.5.8): o alvo é a própria linha.
            if (element.tagName === 'A' && element.closest('p, small')) continue;
            if (box.width < 43.5 || box.height < 43.5) {
              const name = (element.getAttribute('aria-label') || element.textContent || '')
                .trim()
                .slice(0, 40);
              out.push(
                `${element.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`,
              );
            }
          }
        }
        return out;
      });

    await page.goto(listPath(token));
    await expect(page.locator('[data-tour="members-table"]')).toBeVisible();
    expect(await smallTargets(), 'lista de membros').toEqual([]);

    await openProfile(page, person.id);
    expect(await smallTargets(), 'perfil').toEqual([]);

    await button(page, 'Excluir conta…').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
    expect(await smallTargets(), 'diálogo de exclusão').toEqual([]);
  });

  test('lista e perfil passam no axe', async ({ openAs }) => {
    const token = unique('Axe');
    const person = await createUser({ name: `${token} Pessoa` });
    const { page } = await openAs(await createAdmin());
    await page.goto(listPath(token));
    await expect(page.locator('[data-tour="members-table"]')).toBeVisible();
    expect(
      serious((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations),
    ).toEqual([]);

    await openProfile(page, person.id);
    expect(
      serious((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations),
    ).toEqual([]);

    // Também com o diálogo aberto.
    await page.getByLabel('Novo cargo').selectOption('admin');
    await button(page, 'Alterar cargo…').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(
      serious((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations),
    ).toEqual([]);
  });
});

test.describe('perfil', () => {
  test('a própria conta não tem nenhuma ação, só a explicação e o caminho para Minha conta', async ({
    openAs,
  }) => {
    const me = await createAdmin();
    const { page } = await openAs(me);
    await page.goto(profilePath(me.id));
    await expect(page.getByRole('heading', { name: 'Esta é a sua conta' })).toBeVisible();
    for (const name of [
      'Mostrar e-mail',
      'Alterar cargo…',
      'Suspender comentários…',
      'Reativar comentários…',
      'Baixar dados da pessoa…',
      'Excluir conta…',
    ]) {
      await expect(button(page, name)).toHaveCount(0);
    }
    await expect(page.getByLabel('Novo cargo')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Abrir Minha conta' })).toHaveAttribute(
      'href',
      '/conta',
    );
  });

  test('equipe não se suspende nem se exclui por aqui: a instrução é mudar o cargo antes', async ({
    openAs,
  }) => {
    const staff = await createModerator({ name: unique('Equipe') });
    const { page } = await openAs(await createAdmin());
    await page.goto(profilePath(staff.id));
    await expect(button(page, 'Suspender comentários…')).toHaveCount(0);
    await expect(button(page, 'Excluir conta…')).toHaveCount(0);
    await expect(
      page.getByText(/Quem tem cargo de equipe não tem os comentários suspensos/),
    ).toBeVisible();
    await expect(page.getByText(/primeiro mude o cargo para Membro/)).toBeVisible();
    await expect(button(page, 'Alterar cargo…')).toBeVisible();
  });

  test('promover à Moderação: só Comentários; rebaixar: perde o acesso na próxima navegação', async ({
    openAs,
    guard,
  }) => {
    guard.allowStatus(403);
    const target = await createUser({ name: unique('Promovida') });
    const { page: admin } = await openAs(await createAdmin());
    const { page: person } = await openAs(target);

    await openProfile(admin, target.id);
    await admin.getByLabel('Novo cargo').selectOption('moderator');
    await button(admin, 'Alterar cargo…').click();
    const dialog = admin.getByRole('dialog');
    // Moderação não pede nome: só confirma.
    await expect(dialog.getByRole('textbox')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Alterar cargo', exact: true }).click();
    await expect(
      admin.getByRole('status').filter({ hasText: 'Cargo alterado: Membro → Moderação.' }),
    ).toBeVisible();
    expect(roleOf(target.id)).toBe('moderator');
    // A página já mostra o cargo novo e a auditoria o registra, com o nome de quem agiu.
    await expect(admin.getByText('Cargo atual:')).toContainText('Moderação');
    await expect(
      admin.getByRole('list').filter({ hasText: 'Cargo alterado: Membro → Moderação' }),
    ).toBeVisible();

    // A pessoa, sem sair nem entrar de novo: vê só Comentários e recebe 403 em Membros.
    await person.goto('/painel');
    await expect(person).toHaveURL(/\/painel\/comentarios$/);
    expect((await person.goto('/painel/membros'))?.status()).toBe(403);
    expect((await person.goto('/painel/livros'))?.status()).toBe(403);

    // Rebaixa: a próxima navegação (também a feita por link, sem recarregar) já é 403.
    await person.goto('/painel/comentarios');
    await button(admin, 'Alterar cargo…').waitFor();
    await admin.getByLabel('Novo cargo').selectOption('member');
    await button(admin, 'Alterar cargo…').click();
    await admin
      .getByRole('dialog')
      .getByRole('button', { name: 'Alterar cargo', exact: true })
      .click();
    await expect(
      admin.getByRole('status').filter({ hasText: 'Cargo alterado: Moderação → Membro.' }),
    ).toBeVisible();
    expect(roleOf(target.id)).toBe('member');

    await person.getByRole('link', { name: 'Aprovados' }).click();
    await expect(
      person.getByRole('heading', { level: 1, name: 'Você não tem acesso a esta página' }),
    ).toBeVisible();
    expect((await person.goto('/painel/comentarios'))?.status()).toBe(403);
  });

  test('Administração só com o nome digitado; o selo público muda na hora', async ({ openAs }) => {
    const name = unique('NomeCerto');
    const target = await createUser({ name });
    const { slug, sessionPath } = claimPoolSlot();
    insertComment({ slug, authorId: target.id, body: `Comentário de ${name}` });
    const { page: admin } = await openAs(await createAdmin());
    const { page: visitor } = await openAs(await createUser({ name: unique('Leitora') }));

    // Antes: sem selo ao lado do nome da pessoa.
    await visitor.goto(sessionPath);
    const article = visitor.locator('#discussao article', { hasText: `Comentário de ${name}` });
    await expect(article).toBeVisible();
    await expect(article.getByText('Administração', { exact: true })).toHaveCount(0);

    await openProfile(admin, target.id);
    await admin.getByLabel('Novo cargo').selectOption('admin');
    await button(admin, 'Alterar cargo…').click();
    const dialog = admin.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: 'Alterar cargo', exact: true });
    await expect(confirm).toBeDisabled();
    const field = dialog.getByLabel(/Para confirmar, digite o nome da pessoa/);
    await field.fill('Outra Pessoa');
    await expect(confirm).toBeDisabled();
    await field.fill(`  ${name.toLowerCase()} `);
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(
      admin.getByRole('status').filter({ hasText: 'Membro → Administração' }),
    ).toBeVisible();
    expect(roleOf(target.id)).toBe('admin');

    // O cache dos comentários foi expirado: o selo neutro aparece sem esperar.
    await visitor.reload();
    await expect(
      visitor
        .locator('#discussao article', { hasText: `Comentário de ${name}` })
        .getByText('Administração', { exact: true }),
    ).toBeVisible();
    await expect(visitor.getByText('Autora', { exact: true })).toHaveCount(0);
  });

  test('outra pessoa da administração mudou o cargo antes: o banco recusa e a tela pede para atualizar', async ({
    openAs,
  }) => {
    const target = await createUser({ name: unique('Conflito') });
    const { page } = await openAs(await createAdmin());
    await openProfile(page, target.id);
    // Enquanto a tela está aberta, outra pessoa da administração promove a pessoa.
    sql(`update public.profiles set role = 'moderator' where id = ${lit(target.id)};`);

    await page.getByLabel('Novo cargo').selectOption('moderator');
    await button(page, 'Alterar cargo…').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Alterar cargo', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('cargo desta pessoa mudou');
    // Nada foi sobrescrito.
    expect(roleOf(target.id)).toBe('moderator');
    await dialog.getByRole('button', { name: 'Atualizar a página' }).click();
    await expect(page.getByText('Cargo atual:')).toContainText('Moderação');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('quem está suspenso não recebe cargo de equipe: as opções ficam desabilitadas', async ({
    openAs,
  }) => {
    const target = await createUser({ name: unique('Suspensa') });
    suspendBySql(target.id);
    const { page } = await openAs(await createAdmin());
    await openProfile(page, target.id);
    // `toBeDisabled` não vale para <option>: confere o atributo.
    await expect(page.getByRole('option', { name: 'Moderação' })).toHaveAttribute('disabled', '');
    await expect(page.getByRole('option', { name: 'Administração' })).toHaveAttribute(
      'disabled',
      '',
    );
    await expect(page.getByRole('option', { name: 'Membro (atual)' })).not.toHaveAttribute(
      'disabled',
    );
    await expect(page.getByText(/reative-os antes de dar um cargo de equipe/)).toBeVisible();
  });

  test('suspender e reativar: o aviso no compositor, também com a tela já aberta', async ({
    openAs,
  }) => {
    const { slug, sessionPath } = claimPoolSlot();
    const name = unique('Calada');
    const target = await createUser({ name });
    const { page: admin } = await openAs(await createAdmin());
    const { page: person } = await openAs(target);
    const notice =
      'Seus comentários estão suspensos. Fale com a administração pelo e-mail de contato.';

    // A pessoa abre a sessão com o compositor livre e deixa a tela aberta.
    await person.goto(sessionPath);
    await expect(person.getByLabel('Seu comentário')).toBeVisible();
    const stale = person.getByLabel('Seu comentário');
    await untilHydrated(stale);

    await openProfile(admin, target.id);
    await button(admin, 'Suspender comentários…').click();
    const dialog = admin.getByRole('dialog');
    await expect(dialog).toContainText('não consegue publicar comentários nem respostas');
    await dialog.getByRole('button', { name: 'Suspender comentários', exact: true }).click();
    await expect(
      admin.getByRole('status').filter({ hasText: 'Comentários suspensos.' }),
    ).toBeVisible();
    expect(isSuspended(target.id)).toBe(true);
    await expect(admin.getByText('Situação:')).toContainText('Suspenso');

    // Tela velha: o banco recusa e a mensagem é a mesma, com o caminho para o e-mail de contato.
    await stale.fill(`Tentativa ${name}`);
    await person.getByRole('button', { name: 'Publicar comentário' }).click();
    await expect(person.getByRole('alert').filter({ hasText: notice })).toBeVisible();
    expect(
      sqlNumber(
        `select count(*) from public.comments where author_id = ${lit(target.id)} and body = ${lit(`Tentativa ${name}`)};`,
      ),
    ).toBe(0);

    // Tela nova: o aviso no lugar do campo, sem motivo nem data.
    await person.goto(sessionPath);
    await expect(person.getByText(notice)).toBeVisible();
    await expect(person.getByLabel('Seu comentário')).toHaveCount(0);
    await expect(
      person.getByRole('link', { name: 'Ver o e-mail de contato' }).first(),
    ).toHaveAttribute('href', '/privacidade#quem-controla');
    // O aviso inteiro, e só ele: qualquer motivo ou data, em qualquer frase, quebraria a igualdade.
    await expect(person.locator('[data-comments-suspended]')).toHaveText(
      `${notice} Ver o e-mail de contato`,
    );
    // O resto do site segue igual: ela ainda lê e abre Minha conta.
    await person.goto('/conta');
    await expect(person.getByRole('heading', { level: 1, name: 'Minha conta' })).toBeVisible();

    // Reativa.
    await admin.reload();
    await untilHydrated(button(admin, 'Reativar comentários…'));
    await button(admin, 'Reativar comentários…').click();
    await admin
      .getByRole('dialog')
      .getByRole('button', { name: 'Reativar comentários', exact: true })
      .click();
    await expect(
      admin.getByRole('status').filter({ hasText: 'Comentários reativados.' }),
    ).toBeVisible();
    expect(isSuspended(target.id)).toBe(false);
    await person.goto(sessionPath);
    await expect(person.getByLabel('Seu comentário')).toBeVisible();
    void slug;
  });

  test('baixar os dados da pessoa entrega só os dados dela e registra na auditoria', async ({
    openAs,
    browserName,
  }) => {
    const { slug } = claimPoolSlot();
    const name = unique('Dados');
    const target = await createUser({ name });
    const other = await createUser({ name: unique('Outra') });
    const mine = `Comentário da pessoa ${name}`;
    const theirs = `Comentário de outra ${name}`;
    insertComment({ slug, authorId: target.id, body: mine, status: 'pending' });
    insertComment({ slug, authorId: other.id, body: theirs });
    sql(
      `insert into public.reading_progress (user_id, book_id, chapter) select ${lit(target.id)}, id, 3 from public.books where slug = ${lit(slug)};`,
    );
    suspendBySql(target.id);
    const { page } = await openAs(await createAdmin());
    await openProfile(page, target.id);

    await button(page, 'Baixar dados da pessoa…').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Esta ação fica registrada na auditoria');
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith(`/${target.id}/dados`),
    );
    // O WebKit do Playwright não emite o evento de download para anexos que chegam por navegação (nem o GET
    // de /conta/dados): ali o arquivo é conferido pela resposta. No Chromium confere também o download.
    const downloadPromise = browserName === 'chromium' ? page.waitForEvent('download') : null;
    await dialog.getByRole('button', { name: 'Baixar arquivo' }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    const disposition = response.headers()['content-disposition'] ?? '';
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? '';
    expect(disposition).toMatch(/^attachment;/);
    expect(fileName).toMatch(
      new RegExp(`^dados-${target.id.slice(0, 8)}-\\d{4}-\\d{2}-\\d{2}\\.json$`),
    );
    expect(fileName).not.toContain(name);
    // No Chromium o corpo da resposta some quando o download começa: lê o arquivo baixado.
    let text: string;
    if (downloadPromise) {
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(fileName);
      text = readFileSync((await download.path())!, 'utf8');
    } else {
      text = await response.text();
    }
    const file = JSON.parse(text);
    expect(file.exportVersion).toBe(2);
    expect(file.account.id).toBe(target.id);
    expect(file.account.email).toBe(target.email);
    expect(file.profile.displayName).toBe(name);
    expect(file.profile.commentsSuspended).toBe(true);
    expect(file.comments.map((comment: { body: string }) => comment.body)).toEqual([mine]);
    expect(file.comments[0].status).toBe('pending');
    expect(file.readingProgress).toHaveLength(1);
    expect(file.readingProgress[0].chapter).toBe(3);
    // Nada de terceiros nem da equipe.
    expect(text).not.toContain(theirs);
    expect(text).not.toContain(other.email);
    expect(text).not.toContain(other.id);
    expect(text).not.toMatch(/comment_flags|Contém link/);

    expect(auditCount(target.id, 'export_data')).toBe(1);
    await page.goto(profilePath(target.id));
    await expect(
      page.getByRole('list').filter({ hasText: 'Dados da pessoa baixados' }),
    ).toBeVisible();
  });

  test('equipe promovida com a tela aberta: o banco recusa suspender e excluir, em português', async ({
    openAs,
  }) => {
    const target = await createUser({ name: unique('Virou') });
    const { page } = await openAs(await createAdmin());
    await openProfile(page, target.id);
    // Outro caminho promove a pessoa enquanto esta tela (que ainda mostra os botões) fica aberta.
    sql(`update public.profiles set role = 'moderator' where id = ${lit(target.id)};`);

    await button(page, 'Suspender comentários…').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Suspender comentários', exact: true }).click();
    await expect(
      dialog
        .getByRole('alert')
        .filter({ hasText: 'Quem tem cargo de equipe não tem os comentários' }),
    ).toBeVisible();
    expect(isSuspended(target.id)).toBe(false);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);

    await button(page, 'Excluir conta…').click();
    await dialog.getByLabel(/Para confirmar, digite EXCLUIR/).fill('EXCLUIR');
    await dialog.getByRole('button', { name: 'Excluir conta', exact: true }).click();
    await expect(
      dialog.getByRole('alert').filter({ hasText: 'Esta conta tem cargo de equipe' }),
    ).toBeVisible();
    // A conta continua, e a recusa não deixou rastro de exclusão na auditoria.
    expect(sqlNumber(`select count(*) from auth.users where id = ${lit(target.id)};`)).toBe(1);
    expect(auditCount(target.id, 'delete_account')).toBe(0);
    expect(auditCount(target.id, 'suspend')).toBe(0);
  });

  test('Esc duas vezes enquanto a ação roda não fecha o diálogo nem esconde o resultado', async ({
    openAs,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'webkit-mobile', 'Esc é do teclado');
    const target = await createUser({ name: unique('Espera') });
    const { page } = await openAs(await createAdmin());
    await openProfile(page, target.id);
    // Atrasa só a Server Action: o diálogo fica "ocupado" por tempo suficiente para apertar Esc duas vezes.
    await page.route(`**${profilePath(target.id)}`, async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    });

    await button(page, 'Suspender comentários…').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Suspender comentários', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Suspendendo…' })).toBeVisible();
    // O Chromium fecha o <dialog> no segundo Esc sem nova interação, mesmo com o primeiro cancelado.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();

    await expect(
      page.getByRole('status').filter({ hasText: 'Comentários suspensos.' }),
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(isSuspended(target.id)).toBe(true);
    // O botão continua funcionando: o estado não ficou preso.
    await expect(button(page, 'Reativar comentários…')).toBeEnabled();
  });

  test('nome longo e sem espaços não alarga os diálogos nem tira os botões da tela', async ({
    openAs,
  }) => {
    const long = `${unique('L')}_${'a_'.repeat(30)}`.slice(0, 60);
    expect(long).toHaveLength(60);
    const target = await createUser({ name: long });
    const { page } = await openAs(await createAdmin());
    await openProfile(page, target.id);
    const viewport = page.viewportSize()!;

    const check = async (open: () => Promise<void>, confirmName: string) => {
      await open();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.evaluate((el) =>
        Promise.all(el.getAnimations().map((animation) => animation.finished)),
      );
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
        'sem rolagem horizontal dentro do diálogo',
      ).toBe(true);
      for (const name of [confirmName, 'Cancelar']) {
        const box = (await dialog.getByRole('button', { name, exact: true }).boundingBox())!;
        expect(box.x, name).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, name).toBeLessThanOrEqual(viewport.width);
      }
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toHaveCount(0);
    };

    await check(() => button(page, 'Excluir conta…').click(), 'Excluir conta');
    await check(() => button(page, 'Suspender comentários…').click(), 'Suspender comentários');
    await check(async () => {
      await page.getByLabel('Novo cargo').selectOption('admin');
      await button(page, 'Alterar cargo…').click();
    }, 'Alterar cargo');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      'a página também não rola de lado',
    ).toBe(true);
  });

  test('excluir a conta: contagens reais, EXCLUIR digitado e a cascata inteira', async ({
    openAs,
    guard,
  }) => {
    // No fim o teste abre o perfil de quem foi excluído e espera o 404.
    guard.allowStatus(404);
    const { slug } = claimPoolSlot();
    const name = unique('Sai');
    const target = await createUser({ name });
    const stays = await createUser({ name: unique('Fica'), approved: 5 });
    const parent = insertComment({ slug, authorId: target.id, body: `Aprovado de ${name}` });
    insertComment({ slug, authorId: target.id, body: `Pendente de ${name}`, status: 'pending' });
    const reply = insertComment({
      slug,
      authorId: stays.id,
      parentId: parent,
      body: `Resposta de quem fica ${name}`,
    });
    // O contador de aprovados de quem fica subiu com a resposta aprovada.
    expect(
      sqlNumber(`select approved_comment_count from public.profiles where id = ${lit(stays.id)};`),
    ).toBe(6);

    const { page } = await openAs(await createAdmin());
    await openProfile(page, target.id);
    await button(page, 'Excluir conta…').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Não há volta');
    await expect(dialog).toContainText('2 comentários da pessoa');
    await expect(dialog).toContainText('1 resposta de outras pessoas');
    await expect(dialog).toContainText('cópias de segurança podem guardar');
    await expect(dialog).toContainText('não impede');
    await expect(dialog).toContainText('Suspender comentários');

    const confirm = dialog.getByRole('button', { name: 'Excluir conta', exact: true });
    const field = dialog.getByLabel(/Para confirmar, digite EXCLUIR/);
    await expect(confirm).toBeDisabled();
    await field.fill('EXCLUIR AGORA');
    await expect(confirm).toBeDisabled();
    await field.fill('excluir');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page).toHaveURL(/\/painel\/membros\?aviso=conta-excluida$/);
    await expect(page.getByRole('status').filter({ hasText: 'Conta excluída.' })).toBeVisible();
    expect(sqlNumber(`select count(*) from auth.users where id = ${lit(target.id)};`)).toBe(0);
    expect(sqlNumber(`select count(*) from public.profiles where id = ${lit(target.id)};`)).toBe(0);
    expect(
      sqlNumber(`select count(*) from public.comments where author_id = ${lit(target.id)};`),
    ).toBe(0);
    // A resposta de outra pessoa vai junto, e o contador de aprovados dela volta para onde estava.
    expect(sqlNumber(`select count(*) from public.comments where id = ${lit(reply)};`)).toBe(0);
    expect(
      sqlNumber(`select approved_comment_count from public.profiles where id = ${lit(stays.id)};`),
    ).toBe(5);
    expect(auditCount(target.id, 'delete_account')).toBe(1);

    // A pessoa saiu: o perfil dela agora é 404 (e o contador do painel foi refeito sem erro).
    const response = await page.goto(profilePath(target.id));
    expect(response?.status()).toBe(404);
  });
});

test.describe('"Mostrar e-mail"', () => {
  test('o e-mail vive só no estado da tela: não vai a URL, armazenamento, cookie nem aos dados da página, e some ao navegar', async ({
    openAs,
    context,
    browserName,
  }) => {
    const name = unique('Reveal');
    const target = await createUser({ name });
    const { page, context: adminContext } = await openAs(await createAdmin());
    void context;

    // Tudo o que o servidor enviar como página ou dados de navegação (RSC) é conferido.
    const pageBodies: { url: string; text: string }[] = [];
    page.on('response', async (response) => {
      const type = response.headers()['content-type'] ?? '';
      const isAction = response.request().headers()['next-action'] !== undefined;
      if (isAction || !/text\/html|text\/x-component/.test(type)) return;
      try {
        pageBodies.push({ url: response.url(), text: await response.text() });
      } catch {
        // resposta já descartada: não é a que interessa
      }
    });
    const consults = page
      .locator('ol li')
      .filter({ hasText: 'E-mail e último acesso consultados' });
    // Mostrar o e-mail é uma consulta nova (e uma linha nova na auditoria); espera a página se atualizar
    // antes de navegar, para o refresh em andamento não ser cortado.
    const reveal = async () => {
      await untilHydrated(button(page, 'Mostrar e-mail'));
      await button(page, 'Mostrar e-mail').click();
      await expect(page.getByText(target.email)).toBeVisible();
      await expect(consults).toHaveCount(auditCount(target.id, 'view_contact'));
    };
    const idbBefore = async () =>
      page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name).sort());

    await openProfile(page, target.id);
    const before = await idbBefore();
    expect(pageBodies.length).toBeGreaterThan(0);
    for (const body of pageBodies) expect(body.text, body.url).not.toContain(target.email);
    expect(auditCount(target.id, 'view_contact')).toBe(0);

    await button(page, 'Mostrar e-mail').click();
    const shown = page.locator('[data-tour="member-show-email"]');
    await expect(shown.getByText(target.email)).toBeVisible();
    await expect(consults).toHaveCount(1);
    await expect(shown.getByText('Entra com')).toBeVisible();
    await expect(shown.getByText('Código por e-mail')).toBeVisible();
    expect(auditCount(target.id, 'view_contact')).toBe(1);

    // Nenhum lugar persistente guarda o e-mail.
    expect(page.url()).not.toContain('@');
    const storages = await page.evaluate(() => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
      cookie: document.cookie,
      title: document.title,
      name: window.name,
    }));
    expect(JSON.stringify(storages)).not.toContain(target.email);
    expect(JSON.stringify(await adminContext.cookies())).not.toContain(target.email);
    expect(await idbBefore()).toEqual(before);

    // A consulta entrou na auditoria e a página se atualizou: os dados de navegação que o servidor mandou
    // DEPOIS de revelar (o refresh da auditoria) também não têm o e-mail.
    await expect(
      page.getByRole('list').filter({ hasText: 'E-mail e último acesso consultados' }),
    ).toBeVisible();
    for (const body of pageBodies) expect(body.text, body.url).not.toContain(target.email);
    expect(await page.content()).toContain(target.email); // está na tela, e só nela

    // Navegar para outra rota (por link) e voltar pelo histórico: o e-mail não volta.
    await page.getByRole('link', { name: 'Voltar para Membros' }).first().click();
    await expect(page).toHaveURL(/\/painel\/membros$/);
    await page.goBack();
    await expect(page.getByRole('heading', { name: name })).toBeVisible();
    await untilHydrated(button(page, 'Mostrar e-mail'));
    await expect(page.getByText(target.email)).toHaveCount(0);
    expect(await page.content()).not.toContain(target.email);

    // Navegação "de verdade" (carrega outra página e volta). O Playwright desliga o bfcache do Chromium, então
    // aqui a página é recarregada: o passo só prova que uma carga nova não traz o e-mail. A restauração pelo
    // bfcache (os eventos `pagehide` e `pageshow` do `ContactReveal`) só se confere no Safari real
    // (`docs/lancamento.md`).
    await reveal();
    await page.goto('/conta');
    await page.goBack();
    await expect(page.getByRole('heading', { name: name })).toBeVisible();
    await expect(page.getByText(target.email)).toHaveCount(0);
    expect(await page.content()).not.toContain(target.email);

    // Recarregar também esconde.
    await reveal();
    await page.reload();
    await expect(page.getByText(target.email)).toHaveCount(0);

    // E o botão "Ocultar" tira o e-mail da página.
    await reveal();
    await button(page, 'Ocultar e-mail').click();
    await expect(page.getByText(target.email)).toHaveCount(0);
    expect(await page.content()).not.toContain(target.email);
    void browserName;
  });
});

test.describe('"Mostrar e-mail" e o foco', () => {
  test('depois de mostrar o foco vai para os dados; depois de ocultar volta ao botão', async ({
    openAs,
  }) => {
    const target = await createUser({ name: unique('Foco') });
    const { page } = await openAs(await createAdmin());
    await openProfile(page, target.id);
    await button(page, 'Mostrar e-mail').click();
    const data = page.getByRole('group', { name: 'Dados de contato da pessoa' });
    await expect(data).toContainText(target.email);
    // Sem isto o botão que tinha o foco sai da tela e o foco cai no <body>, em silêncio.
    await expect(data).toBeFocused();
    await button(page, 'Ocultar e-mail').click();
    await expect(page.getByText(target.email)).toHaveCount(0);
    await expect(button(page, 'Mostrar e-mail')).toBeFocused();
  });
});

test.describe('diálogos de confirmação', () => {
  test('desktop: caixa centralizada; Esc fecha e o foco volta ao botão que abriu', async ({
    openAs,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'webkit-mobile', 'a folha inferior é do toque');
    const target = await createUser({ name: unique('Foco') });
    const { page } = await openAs(await createAdmin());
    await openProfile(page, target.id);
    const opener = button(page, 'Suspender comentários…');
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.width).toBeLessThanOrEqual(480);
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(3);
    // Em perigo, o foco inicial é "Cancelar".
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(isSuspended(target.id)).toBe(false);
  });

  test('toque: folha inferior com alvos de 44px, campos de 16px e sem rolagem horizontal @mobile', async ({
    openAs,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-mobile', 'a folha inferior é do toque');
    const target = await createUser({ name: unique('Folha') });
    const { page } = await openAs(await createAdmin());
    await openProfile(page, target.id);

    await button(page, 'Excluir conta…').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Espera a folha terminar de subir (animação de 0,22 s) antes de medir.
    await dialog.evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished)),
    );
    const viewport = page.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    // Encostada embaixo, na largura toda.
    expect(Math.abs(box.x)).toBeLessThan(2);
    expect(Math.abs(box.width - viewport.width)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThan(2);
    expect(box.height).toBeLessThanOrEqual(viewport.height);
    for (const name of ['Excluir conta', 'Cancelar']) {
      const target44 = (await dialog.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(target44.height, name).toBeGreaterThanOrEqual(44);
    }
    // O texto do diálogo (avisos, itens da lista e rótulo do campo) também tem pelo menos 16px.
    const textSizes = await dialog
      .locator('p, li, label')
      .evaluateAll((nodes) => nodes.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(textSizes.length).toBeGreaterThan(4);
    expect(Math.min(...textSizes)).toBeGreaterThanOrEqual(16);
    const input = dialog.getByLabel(/Para confirmar, digite EXCLUIR/);
    expect(
      await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      serious((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations),
    ).toEqual([]);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
