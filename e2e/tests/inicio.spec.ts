import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { untilHydrated } from '../support/hydration';
import { untilMotionSettles } from '../support/motion';

/*
 * A home "A página aberta" (impeccable overdrive): o livro atual aberto, com a sessão mais recente na página da
 * direita e as anteriores a uma virada de folha. A folha é animada com o Motion (Web Animations API), então as
 * animações se leem por `document.getAnimations()` no mesmo quadro do gesto, e o estado final é conferido depois
 * (ele não pode depender da animação ter rodado).
 */

const leaf = (page: Page) => page.locator('[data-home-leaf]');

/** As sessões do sumário, da mais nova para a mais antiga: número e título. */
async function tocSessions(page: Page) {
  const entries = page.getByRole('region', { name: 'Sumário' }).getByRole('link');
  // `all()` não espera: sem isto, a lista pode vir vazia se a página ainda estiver chegando.
  await expect(entries.first()).toBeVisible();
  const result: { number: number; title: string }[] = [];
  for (const entry of await entries.all()) {
    const num = await entry.locator('span').first().textContent();
    const title = await entry.locator('span').nth(1).textContent();
    result.push({ number: Number(num?.replace(/\D/g, '')), title: title ?? '' });
  }
  return result;
}

/** Clica e devolve o que as animações da folha fazem nesse quadro (transform e opacidade dos quadros-chave). */
async function clickAndReadLeafFrames(button: Locator) {
  await untilHydrated(button);
  return button.evaluate(async (element) => {
    (element as HTMLButtonElement).click();
    // Um quadro: o React desenha a folha e o Motion começa as animações (que duram bem mais que isso).
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const root = document.querySelector('[data-home-leaf]')!;
    return document
      .getAnimations()
      .filter((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        return target instanceof Element && root.contains(target);
      })
      .flatMap((a) => (a.effect as KeyframeEffect).getKeyframes())
      .map((frame) => ({
        transform: typeof frame.transform === 'string' ? frame.transform : null,
        opacity: frame.opacity ?? null,
      }));
  });
}

test.describe('home: a página aberta', () => {
  test('folheia entre as sessões pelos botões, com o foco no lugar certo @mobile', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'O Livro de Azrael' })).toBeVisible();
    const toc = await tocSessions(page);
    expect(toc.length).toBeGreaterThan(1);
    const [latest, previous] = toc;

    // A página da direita abre na sessão mais recente; só dá para voltar.
    await expect(leaf(page).getByRole('heading', { level: 2, name: latest!.title })).toBeVisible();
    await expect(leaf(page).getByRole('button', { name: /^Folhear para a sessão/ })).toHaveCount(1);

    const back = leaf(page).getByRole('button', {
      name: `Folhear para a sessão ${previous!.number}`,
    });
    await untilHydrated(back);
    await back.click();
    await expect(
      leaf(page).getByRole('heading', { level: 2, name: previous!.title }),
    ).toBeVisible();
    await untilMotionSettles(page);
    await expect(leaf(page).locator('[inert]')).toHaveCount(0);
    await expect(
      leaf(page).getByText(`Sessão ${previous!.number}: ${previous!.title}`),
    ).toHaveCount(1);
    await expect(leaf(page).getByRole('link', { name: 'Ler a sessão' })).toHaveAttribute(
      'href',
      new RegExp(`/sessoes/${previous!.number}$`),
    );

    // De volta à mais recente: o botão "seguinte" some, e o foco vai para o outro (nunca para o corpo da página).
    await leaf(page)
      .getByRole('button', { name: `Folhear para a sessão ${latest!.number}` })
      .click();
    await expect(leaf(page).getByRole('heading', { level: 2, name: latest!.title })).toBeVisible();
    await untilMotionSettles(page);
    await expect(
      leaf(page).getByRole('button', { name: `Folhear para a sessão ${previous!.number}` }),
    ).toBeFocused();
  });

  test('a folha gira; com menos movimento, só esmaece', async ({ page }) => {
    await page.goto('/');
    const [, previous] = await tocSessions(page);
    const back = leaf(page).getByRole('button', {
      name: `Folhear para a sessão ${previous!.number}`,
    });
    const frames = await clickAndReadLeafFrames(back);
    expect(frames.some((f) => /rotate[XY]\(-?90deg\)/.test(f.transform ?? ''))).toBe(true);
    await untilMotionSettles(page);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const again = leaf(page).getByRole('button', {
      name: `Folhear para a sessão ${previous!.number}`,
    });
    const reduced = await clickAndReadLeafFrames(again);
    expect(reduced.length).toBeGreaterThan(0);
    expect(reduced.every((f) => f.transform === null)).toBe(true);
    await expect(
      leaf(page).getByRole('heading', { level: 2, name: previous!.title }),
    ).toBeVisible();
  });

  test('arrastar para o lado vira a página; rolar na vertical, não @mobile', async ({ page }) => {
    await page.goto('/');
    const [latest, previous] = await tocSessions(page);
    const target = leaf(page);
    await untilHydrated(target.getByRole('link', { name: 'Ler a sessão' }));

    const swipe = (dx: number, dy: number) =>
      target.evaluate(
        (element, { dx, dy }) => {
          const box = element.getBoundingClientRect();
          const x = box.left + box.width / 2;
          const y = box.top + 120;
          const init = { pointerId: 7, pointerType: 'touch', bubbles: true, isPrimary: true };
          element.dispatchEvent(
            new PointerEvent('pointerdown', { ...init, clientX: x, clientY: y }),
          );
          element.dispatchEvent(
            new PointerEvent('pointerup', { ...init, clientX: x + dx, clientY: y + dy }),
          );
        },
        { dx, dy },
      );

    await swipe(10, 160);
    await untilMotionSettles(page);
    await expect(target.getByRole('heading', { level: 2, name: latest!.title })).toBeVisible();

    await swipe(140, 12);
    await expect(target.getByRole('heading', { level: 2, name: previous!.title })).toBeVisible();
    await untilMotionSettles(page);

    await swipe(-140, 0);
    await expect(target.getByRole('heading', { level: 2, name: latest!.title })).toBeVisible();
  });

  test('o sumário leva às sessões, e nada rola de lado no celular estreito', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    const toc = page.getByRole('region', { name: 'Sumário' });
    const first = toc.getByRole('link').first();
    await expect(first).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      'rolagem horizontal em 320px',
    ).toBe(true);
    await first.click();
    await expect(page).toHaveURL(/\/livros\/[^/]+\/sessoes\/\d+$/);
  });
});
