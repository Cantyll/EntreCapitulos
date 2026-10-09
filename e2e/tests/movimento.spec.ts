import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { untilHydrated } from '../support/hydration';
import { createAdmin } from '../support/users';
import { WORLD, chapterText, claimPoolSlot, sessionPath } from '../support/world';

/*
 * Movimento ("Movimento" no DESIGN.md): a névoa do spoiler, o marca-texto e a saída dos diálogos. As animações são
 * curtas, então cada verificação lê o nome da animação no mesmo quadro do gesto (page.evaluate), e depois confere o
 * estado final (que não pode depender da animação ter rodado).
 */

const { readingSlug, sessions } = WORLD;
const path = sessionPath(readingSlug, sessions.public.number);

/** A área do texto do capítulo (o primeiro filho da cobertura, onde fica a névoa). */
const contentOf = (page: Page, chapter: number) =>
  page.locator(`#ch-${chapter} > div > div`).first();

/**
 * Clica no botão e devolve as animações que começaram dentro da seção. Conta pelo evento `animationstart`, não
 * pelas animações em curso num quadro: no WebKit do CI os quadros demoram, e a saída do cartão (160ms) já pode ter
 * acabado quando o quadro seguinte chega.
 */
async function clickAndReadAnimations(button: Locator, sectionId: string) {
  await untilHydrated(button);
  return button.evaluate(async (element, id) => {
    const section = document.getElementById(id)!;
    const names: string[] = [];
    const record = (event: AnimationEvent) => names.push(event.animationName);
    section.addEventListener('animationstart', record);
    (element as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 600));
    section.removeEventListener('animationstart', record);
    return names;
  }, sectionId);
}

test.describe('movimento', () => {
  test('a névoa se desfaz ao mostrar um capítulo, e o cartão de revelar sai @mobile', async ({
    page,
  }) => {
    await page.goto(path);
    const button = page.getByRole('button', { name: 'Mostrar o capítulo 3 mesmo assim' });
    const names = await clickAndReadAnimations(button, 'ch-3');
    expect(names.some((name) => /unveil/.test(name) && !/fade/.test(name))).toBe(true);
    expect(names.some((name) => /veil-out/.test(name))).toBe(true);

    // Estado final: sem cartão, sem área inerte, texto nítido.
    await expect(page.locator('#ch-3 [inert]')).toHaveCount(0);
    await expect(page.getByText(chapterText(3))).toBeVisible();
    await expect
      .poll(() => contentOf(page, 3).evaluate((element) => getComputedStyle(element).filter))
      .toBe('none');
  });

  test('ao subir o progresso, os capítulos se descobrem na ordem de leitura', async ({ page }) => {
    await page.goto(path);
    const select = page.getByLabel('Li até o').first();
    await untilHydrated(select);
    // Anota o passo da cascata de cada capítulo assim que ele aparece no estilo.
    await page.evaluate(() => {
      const steps: Record<string, string> = {};
      (window as unknown as { __steps: typeof steps }).__steps = steps;
      new MutationObserver((records) => {
        for (const record of records) {
          const element = record.target as HTMLElement;
          const step = element.style.getPropertyValue('--unveil-step');
          const chapter = element.closest('section')?.dataset.chapter;
          if (step && chapter) steps[chapter] = step;
        }
      }).observe(document.body, { subtree: true, attributeFilter: ['style'] });
    });
    await select.selectOption({ label: 'Capítulo 3' });
    await expect(page.locator('#ch-3 [inert]')).toHaveCount(0);
    const steps = await page.evaluate(
      () => (window as unknown as { __steps: Record<string, string> }).__steps,
    );
    // O primeiro capítulo não espera (sem passo); os seguintes, um passo cada.
    expect(steps).toEqual({ '2': '1', '3': '2' });
  });

  test('chegar a um capítulo pelo endereço risca o rótulo com o marca-texto', async ({ page }) => {
    await page.goto(`${path}#ch-2`);
    const label = page.locator('#ch-2 > h2 small');
    await expect(label).toBeVisible();
    const names = await label.evaluate((element) => [
      getComputedStyle(element).animationName,
      getComputedStyle(element, '::before').animationName,
    ]);
    expect(names[0]).toMatch(/mark-ink/);
    expect(names[1]).toMatch(/mark-sweep/);
    // Outro capítulo, sem alvo, não tem marca.
    expect(
      await page
        .locator('#ch-1 > h2 small')
        .evaluate((element) => getComputedStyle(element, '::before').animationName),
    ).toBe('none');
  });

  test('o comentário recém-publicado ganha o marca-texto', async ({ signedIn }) => {
    const { sessionPath: poolPath } = claimPoolSlot();
    const text = `Comentário marcado ${Date.now().toString(36)}`;
    const { page } = await signedIn({ approved: 3 });
    await page.goto(poolPath);
    const field = page.getByLabel('Seu comentário');
    await untilHydrated(field);
    await field.fill(text);
    await page.getByRole('button', { name: 'Publicar comentário' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Comentário publicado.' }),
    ).toBeVisible();

    const article = page.locator('article[id^="comentario-"]').filter({ hasText: text });
    await expect(article).toHaveClass(/justPosted/);
    expect(
      await article.evaluate((element) => getComputedStyle(element, '::before').animationName),
    ).toMatch(/posted-sweep/);
    // Os outros comentários não.
    await expect(page.locator('article[class*="justPosted"]')).toHaveCount(1);
  });

  test('o menu de ajuda sai do painel com uma transição, não de uma vez', async ({
    openAs,
    browserName,
  }) => {
    // `display` e `overlay` discretos: o WebKit do Playwright pode não ter; a regra é aprimoramento progressivo.
    test.skip(browserName !== 'chromium', 'transição discreta conferida no Chromium');
    const { page } = await openAs(await createAdmin());
    await page.goto('/painel');
    const help = page.getByRole('button', { name: 'Ajuda e tutorial' });
    await untilHydrated(help);
    await help.click();
    const menu = page.locator('dialog[data-tour-menu]');
    await expect(menu).toBeVisible();
    await page.waitForTimeout(400);

    const closing = await menu.evaluate(async (dialog: HTMLDialogElement) => {
      dialog.close();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        open: dialog.open,
        display: getComputedStyle(dialog).display,
        transitions: dialog
          .getAnimations()
          .map((animation) => (animation as CSSTransition).transitionProperty ?? ''),
      };
    });
    expect(closing.open).toBe(false);
    expect(closing.display).not.toBe('none');
    expect(closing.transitions).toContain('opacity');
    await expect(menu).toBeHidden();
  });
});

test.describe('movimento com "menos movimento"', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a névoa só esmaece, sem desfoque animado @mobile', async ({ page }) => {
    await page.goto(path);
    const button = page.getByRole('button', { name: 'Mostrar o capítulo 3 mesmo assim' });
    const names = await clickAndReadAnimations(button, 'ch-3');
    expect(names.some((name) => /unveil-fade/.test(name))).toBe(true);
    expect(names.some((name) => /unveil/.test(name) && !/fade/.test(name))).toBe(false);
    await expect(page.locator('#ch-3 [inert]')).toHaveCount(0);
    await expect(page.getByText(chapterText(3))).toBeVisible();
  });

  test('o marca-texto acende e apaga, sem correr pela linha', async ({ page }) => {
    await page.goto(`${path}#ch-2`);
    const label = page.locator('#ch-2 > h2 small');
    await expect(label).toBeVisible();
    expect(
      await label.evaluate((element) => getComputedStyle(element, '::before').animationName),
    ).toMatch(/mark-glow/);
  });
});
