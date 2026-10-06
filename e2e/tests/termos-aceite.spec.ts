import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { TERMS_VERSION } from '../../src/content/legal/version';
import { lit, sql } from '../support/db';
import { expect, test } from '../support/fixtures';
import { untilHydrated } from '../support/hydration';
import { createAdmin, createModerator } from '../support/users';
import { claimPoolSlot } from '../support/world';

/*
 * Aceite dos Termos e declaração de ter 18 anos ou mais (etapa 8g). O que se confere no navegador: a caixa do
 * primeiro acesso (nunca marcada, obrigatória, por teclado, conferida também no servidor), o aviso para quem não
 * aceitou (a equipe também), o convite no lugar do campo de comentário, a equipe isenta, a versão antiga que pede de
 * novo sem bloquear e o `first_accepted_at` que nunca muda. A idade é declarada: nenhuma tela diz que foi verificada.
 */

const BOX = /Declaro que tenho 18 anos ou mais/;
const NOTICE = 'Aviso sobre os Termos';
const POSTED = /Comentário publicado\.|Recebemos seu comentário/;

let counter = 0;
const unique = (label: string) =>
  `${label} ${Date.now().toString(36)}${(counter += 1)}${Math.random().toString(36).slice(2, 6)}`;

/** `versão|(primeiro aceite = último aceite)` da pessoa, ou texto vazio se nunca aceitou. */
const termsRow = (userId: string) =>
  sql(
    `select version || '|' || (accepted_at = first_accepted_at)::text from public.terms_acceptances where user_id = ${lit(userId)};`,
  );

/**
 * O navegador pede `/favicon.ico` por conta própria quando navega rápido demais para ler o `<link rel="icon">`, e o
 * site (que serve o ícone por `/icon`) responde 404. É um ruído que já existia e que o `guard` registra como
 * `console.error` de vez em quando; aqui ele é respondido com 204, sem afrouxar o guard para os outros 404.
 */
async function quietFavicon(page: Page) {
  await page.context().route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
}

async function post(page: Page, text: string) {
  const field = page.getByLabel('Seu comentário');
  await untilHydrated(field);
  await field.fill(text);
  await page.getByRole('button', { name: 'Publicar comentário' }).click();
  await expect(page.getByRole('status').filter({ hasText: POSTED })).toBeVisible();
}

/** axe (WCAG 2.0 A e AA): falha com qualquer violação "serious" ou "critical". */
async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    );
  expect(serious, `${label}: violações de acessibilidade`).toEqual([]);
}

test.describe('aceite dos Termos', () => {
  test('primeiro acesso: a caixa nunca vem marcada, é obrigatória, funciona por teclado e o servidor também confere', async ({
    signedIn,
  }) => {
    const { page, user } = await signedIn({ name: null, terms: false });
    await quietFavicon(page);
    await page.goto('/boas-vindas');

    const box = page.getByLabel(BOX);
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    await expect(box).toHaveAttribute('required', '');
    await expect(page.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute(
      'href',
      '/termos',
    );
    await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    );
    // A idade é declarada: nada na página diz que foi verificada ou confirmada.
    expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(
      /idade[^.]{0,60}(verificad|confirmad)|(verificad|confirmad)[^.]{0,60}idade/,
    );

    const name = page.getByLabel('Como devemos chamar você nos comentários?');
    await untilHydrated(name);
    await name.fill('Leitora do Aceite');

    // 1) Sem a caixa o navegador não envia.
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(/\/boas-vindas$/);
    expect(await box.evaluate((el) => (el as HTMLInputElement).validity.valueMissing)).toBe(true);

    // 2) O servidor também confere: com a validação do navegador desligada, o envio sem a caixa é recusado.
    await page.locator('form', { has: box }).evaluate((form) => {
      (form as HTMLFormElement).noValidate = true;
    });
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'marque a caixa' })).toBeVisible();
    await expect(page).toHaveURL(/\/boas-vindas$/);
    expect(termsRow(user.id)).toBe('');
    // Nem o nome foi salvo: a conferência da caixa vem antes de qualquer gravação.
    expect(
      sql(
        `select display_name_confirmed_at is null from public.profiles where id = ${lit(user.id)};`,
      ),
    ).toBe('t');

    // 3) Por teclado: foca a caixa, marca com a barra de espaço e envia.
    await expect(box).not.toBeChecked();
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(termsRow(user.id)).toBe(`${TERMS_VERSION}|true`);
  });

  test('quem nunca aceitou vê o aviso e o convite no lugar do campo; aceita e comenta', async ({
    signedIn,
  }) => {
    const { sessionPath: path } = claimPoolSlot();
    const { page, user } = await signedIn({ terms: false });
    await quietFavicon(page);
    await page.goto(path);

    const notice = page.getByRole('region', { name: NOTICE });
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('data-terms-notice', 'missing');
    await expect(notice).toContainText('você pode ler, mas não pode comentar');

    const invite = page.locator('[data-terms-required]');
    await expect(invite).toContainText(
      'Para comentar, aceite os Termos e a Política de Privacidade.',
    );
    await expect(page.getByLabel('Seu comentário')).toHaveCount(0);

    await invite.getByRole('link', { name: 'Aceitar os Termos' }).click();
    await expect(page).toHaveURL(/\/boas-vindas\?next=/);
    // O nome já foi escolhido: só a caixa. E o aviso não repete o que a própria página pede.
    await expect(page.getByLabel('Como devemos chamar você nos comentários?')).toHaveCount(0);
    await expect(page.getByRole('region', { name: NOTICE })).toHaveCount(0);
    const box = page.getByLabel(BOX);
    await untilHydrated(box);
    await box.check();
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page).toHaveURL((url) => url.pathname === path);
    await expect(notice).toHaveCount(0);
    expect(termsRow(user.id)).toBe(`${TERMS_VERSION}|true`);
    await post(page, unique('Depois de aceitar'));
  });

  test('versão antiga: o aviso pede de novo, o comentário continua liberado e o primeiro aceite é preservado', async ({
    signedIn,
  }) => {
    const { sessionPath: path } = claimPoolSlot();
    const { page, user } = await signedIn({ terms: 'old' });
    await quietFavicon(page);
    sql(
      `update public.terms_acceptances set accepted_at = now() - interval '30 days', first_accepted_at = now() - interval '30 days' where user_id = ${lit(user.id)};`,
    );
    await page.goto(path);

    const notice = page.getByRole('region', { name: NOTICE });
    await expect(notice).toHaveAttribute('data-terms-notice', 'outdated');
    await expect(notice).toContainText('Atualizamos os Termos de Uso');
    // Versão antiga não bloqueia: o campo continua lá.
    await expect(page.getByLabel('Seu comentário')).toBeVisible();
    await expect(page.locator('[data-terms-required]')).toHaveCount(0);

    await notice.getByRole('link', { name: 'Ler e aceitar' }).click();
    await expect(page).toHaveURL(/\/boas-vindas\?next=/);
    await expect(page.getByText('Atualizamos os Termos de Uso')).toBeVisible();
    const box = page.getByLabel(BOX);
    await untilHydrated(box);
    await box.check();
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page).toHaveURL((url) => url.pathname === path);
    await expect(notice).toHaveCount(0);
    // Versão nova, data nova; o PRIMEIRO aceite (30 dias atrás) nunca muda.
    expect(
      sql(
        `select version || '|' || (first_accepted_at < accepted_at)::text || '|' || (first_accepted_at < now() - interval '29 days')::text from public.terms_acceptances where user_id = ${lit(user.id)};`,
      ),
    ).toBe(`${TERMS_VERSION}|true|true`);
  });

  test('a equipe é isenta de aceitar para comentar, mas vê o aviso no site e no painel', async ({
    openAs,
  }) => {
    const { sessionPath: path } = claimPoolSlot();
    const admin = await createAdmin({ terms: false });
    const { page } = await openAs(admin);
    await quietFavicon(page);
    await page.goto(path);

    const notice = page.getByRole('region', { name: NOTICE });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Falta aceitar os Termos de Uso');
    await expect(notice).not.toContainText('não pode comentar');
    // O campo continua lá e o comentário da administração é publicado direto (o banco não pede o aceite).
    await expect(page.locator('[data-terms-required]')).toHaveCount(0);
    await post(page, unique('Administração sem aceite'));
    expect(termsRow(admin.id)).toBe('');

    await page.goto('/painel');
    await expect(page.getByRole('region', { name: NOTICE })).toBeVisible();

    const moderator = await createModerator({ terms: false });
    const { page: modPage } = await openAs(moderator);
    await quietFavicon(modPage);
    await modPage.goto('/painel/comentarios');
    await expect(modPage.getByRole('region', { name: NOTICE })).toBeVisible();
  });

  test('o aviso não aparece para visitante nem para quem já aceitou', async ({
    page,
    signedIn,
  }) => {
    const notice = (p: Page) => p.getByRole('region', { name: NOTICE });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(notice(page)).toHaveCount(0);

    const { page: accepted } = await signedIn();
    await quietFavicon(accepted);
    await accepted.goto('/');
    await expect(accepted.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(notice(accepted)).toHaveCount(0);

    // Controle: quem não aceitou vê o aviso na mesma página.
    const { page: pending } = await signedIn({ terms: false });
    await quietFavicon(pending);
    await pending.goto('/');
    await expect(notice(pending)).toBeVisible();
  });

  test('acessibilidade (axe): a caixa do primeiro acesso, o aviso e o convite', async ({
    signedIn,
  }) => {
    const { sessionPath: path } = claimPoolSlot();
    const { page } = await signedIn({ name: null, terms: false });
    await quietFavicon(page);
    await page.goto('/boas-vindas');
    await expect(page.getByLabel(BOX)).toBeVisible();
    await expectNoSeriousViolations(page, '/boas-vindas com a caixa');

    const { page: member } = await signedIn({ terms: false });
    await quietFavicon(member);
    await member.goto(path);
    await expect(member.getByRole('region', { name: NOTICE })).toBeVisible();
    await expect(member.locator('[data-terms-required]')).toBeVisible();
    await expectNoSeriousViolations(member, 'sessão com o aviso e o convite');
  });
});
