import type { Page } from '@playwright/test';

import { lit, sql } from '../support/db';
import { expect, test } from '../support/fixtures';
import { untilHydrated } from '../support/hydration';
import { findPending } from '../support/moderation';
import { createModerator } from '../support/users';
import { WORLD, claimPoolSlot, sessionPath } from '../support/world';

let counter = 0;
/** Texto único por comentário, para achar o comentário certo no meio dos dos outros testes. */
const unique = (label: string) =>
  `${label} ${Date.now().toString(36)}${(counter += 1)}${Math.random().toString(36).slice(2, 6)}`;

const POSTED = /Comentário publicado\.|Recebemos seu comentário/;

/**
 * Publica e ESPERA a confirmação do servidor. Sem isso o teste seguiria antes de o comentário
 * existir e de o cache da lista expirar, e outra página abriria e guardaria a lista vazia.
 */
async function post(
  page: Page,
  text: string,
  options: { spoilerUpTo?: number; expectError?: boolean } = {},
) {
  const field = page.getByLabel('Seu comentário');
  await untilHydrated(field);
  await field.fill(text);
  if (options.spoilerUpTo !== undefined) {
    await page
      .getByLabel(/Fala de algo depois do capítulo/)
      .selectOption(String(options.spoilerUpTo));
  }
  await page.getByRole('button', { name: 'Publicar comentário' }).click();
  if (!options.expectError)
    await expect(page.getByRole('status').filter({ hasText: POSTED })).toBeVisible();
}

test.describe('comentários', () => {
  test('membro novo fica "Em análise", o visitante não vê e a moderação aprova @mobile', async ({
    signedIn,
    page: visitor,
    openAs,
  }) => {
    const { sessionPath: path } = claimPoolSlot();
    const text = unique('Primeiro comentário');
    const { page: member } = await signedIn();
    await member.goto(path);
    await post(member, text);
    await expect(member.getByText(text)).toBeVisible();
    await expect(member.getByText('Em análise')).toBeVisible();

    await visitor.goto(path);
    await expect(visitor.getByRole('heading', { name: /Discussão/ })).toBeVisible();
    await expect(visitor.getByText(text)).toHaveCount(0);

    const { page: moderator } = await openAs(await createModerator());
    const item = await findPending(moderator, text);
    await item.getByRole('button', { name: 'Aprovar', exact: true }).click();
    await expect(moderator.getByText(text)).toHaveCount(0);

    await visitor.goto(path);
    await expect(visitor.getByText(text)).toBeVisible();
    await member.reload();
    await expect(member.getByText(text)).toBeVisible();
    await expect(member.getByText('Em análise')).toHaveCount(0);
  });

  test('comentário com link fica pendente com a marca "Contém link", mesmo para membro de confiança', async ({
    signedIn,
    page: visitor,
    openAs,
  }) => {
    const { sessionPath: path } = claimPoolSlot();
    const text = unique('Olhem https://exemplo.com/livro');
    const { page: member } = await signedIn({ approved: 3 });
    await member.goto(path);
    await post(member, text);
    await expect(member.getByText('Em análise')).toBeVisible();

    await visitor.goto(path);
    await expect(visitor.getByText(text)).toHaveCount(0);

    const { page: moderator } = await openAs(await createModerator());
    const item = await findPending(moderator, text);
    await expect(item.getByText('Alerta: Contém link')).toBeVisible();
  });

  test('membro com 3 aprovados publica direto @mobile', async ({ signedIn, page: visitor }) => {
    const { sessionPath: path } = claimPoolSlot();
    const text = unique('Direto para a página');
    const { page: member } = await signedIn({ approved: 3 });
    await member.goto(path);
    await post(member, text);
    await expect(member.getByText(text)).toBeVisible();
    await expect(member.getByText('Em análise')).toHaveCount(0);

    await visitor.goto(path);
    await expect(visitor.getByText(text)).toBeVisible();
  });

  test('comentário com marca de spoiler aparece coberto e pode ser revelado', async ({
    signedIn,
    page: reader,
  }) => {
    const { sessionPath: path } = claimPoolSlot();
    const text = unique('Spoiler do final');
    const { page: author } = await signedIn({ approved: 3 });
    await author.goto(path);
    // A sessão cobre os capítulos 1 a 3 de um livro de 6: a marca vai de 4 a 6.
    await post(author, text, { spoilerUpTo: 5 });
    await expect(author.getByText(text)).toBeVisible();

    await reader.goto(path);
    const cover = reader.getByRole('button', { name: /Spoiler até o capítulo 5/ });
    await expect(cover).toBeVisible();
    // Coberto: o texto continua no HTML, mas fica `inert` (fora do foco e do leitor de tela).
    await expect(reader.locator('[inert]').filter({ hasText: text })).toHaveCount(1);
    await cover.click();
    await expect(reader.locator('[inert]').filter({ hasText: text })).toHaveCount(0);
    await expect(reader.getByText(text)).toBeVisible();
  });

  test('resposta aparece embaixo do comentário aprovado', async ({ signedIn }) => {
    const { sessionPath: path } = claimPoolSlot();
    const text = unique('Comentário principal');
    const answer = unique('Resposta ao principal');
    const { page: author } = await signedIn({ approved: 3, name: 'Autora Principal' });
    await author.goto(path);
    await post(author, text);
    await expect(author.getByText(text)).toBeVisible();

    const { page: replier } = await signedIn({ approved: 3, name: 'Quem Responde' });
    await replier.goto(path);
    await replier.getByRole('button', { name: 'Responder a Autora Principal' }).click();
    const replyField = replier.getByLabel('Sua resposta a Autora Principal');
    await untilHydrated(replyField);
    await replyField.fill(answer);
    await replier.getByRole('button', { name: 'Responder', exact: true }).click();
    await expect(replier.getByRole('status').filter({ hasText: POSTED })).toBeVisible();
    await expect(
      replier.getByRole('list', { name: 'Respostas a Autora Principal' }).getByText(answer),
    ).toBeVisible();

    await author.reload();
    await expect(
      author.getByRole('list', { name: 'Respostas a Autora Principal' }).getByText(answer),
    ).toBeVisible();
  });

  test('sessão com comentários fechados não tem formulário', async ({ signedIn }) => {
    const { page } = await signedIn({ approved: 3 });
    await page.goto(sessionPath(WORLD.readingSlug, WORLD.sessions.closed.number));
    await expect(page.getByText('Os comentários desta sessão estão fechados.')).toBeVisible();
    await expect(page.getByLabel('Seu comentário')).toHaveCount(0);
  });

  test('o 4º comentário no mesmo minuto é recusado, em português', async ({ signedIn }) => {
    const { sessionPath: path } = claimPoolSlot();
    const { page, user } = await signedIn({ approved: 3 });
    await page.goto(path);
    for (let i = 1; i <= 3; i += 1) {
      const text = unique(`Comentário ${i} do limite`);
      await post(page, text);
      await expect(page.getByText(text)).toBeVisible();
    }
    const fourth = unique('Quarto comentário');
    await post(page, fourth, { expectError: true });
    await expect(page.getByRole('alert').filter({ hasText: 'rápido demais' })).toHaveText(
      'Você está comentando rápido demais. Espere um pouco e tente de novo.',
    );
    // O texto digitado continua no campo para a pessoa tentar de novo depois.
    await expect(page.getByLabel('Seu comentário')).toHaveValue(fourth);
    expect(sql(`select count(*) from public.comments where author_id = ${lit(user.id)};`)).toBe(
      '3',
    );
  });

  test('excluir o próprio comentário apaga o texto no banco', async ({ signedIn }) => {
    const { sessionPath: path } = claimPoolSlot();
    const text = unique('Vou me arrepender');
    const { page, user } = await signedIn({ approved: 3 });
    await page.goto(path);
    await post(page, text);
    await expect(page.getByText(text)).toBeVisible();

    await page.getByRole('button', { name: 'Excluir meu comentário' }).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(page.getByText(text)).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /exclu/i }).first()).toBeVisible();

    const row = sql(
      `select status || '|' || body from public.comments where author_id = ${lit(user.id)};`,
    );
    expect(row).toBe('removed|[comentário removido pelo autor]');
  });

  test('<script> e <img onerror> aparecem como texto, sem executar', async ({ signedIn }) => {
    const { sessionPath: path } = claimPoolSlot();
    const marker = unique('xss');
    const text = `${marker} <script>window.__xss = 1</script> <img src=x onerror="window.__xss = 2">`;
    const { page } = await signedIn({ approved: 3 });
    // Se a página tentasse carregar a imagem `x`, o navegador registraria um 404: aqui isso seria falha.
    await page.goto(path);
    await post(page, text);
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.locator('li img[src="x"]')).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
    ).toBeUndefined();
  });
});
