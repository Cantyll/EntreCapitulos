import { expect, test } from '../support/fixtures';

/*
 * "Escrito a lápis" (impeccable overdrive e animate da página Sobre): `PencilMarks` escreve o título quando a página já
 * está sendo desenhada e depois desenha os traços, um por vez, quando cada trecho aparece na tela. Só lê `/sobre` (com o texto padrão: o `globalSetup` apaga o publicado), então
 * roda em paralelo com os outros.
 */

test.describe('página Sobre escrita a lápis', () => {
  test('o título continua o mesmo texto e cada traço se desenha ao aparecer na tela', async ({
    page,
  }) => {
    await page.goto('/sobre');
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveText('Oi, eu sou a Agatha.');
    await expect(title).toHaveAccessibleName('Oi, eu sou a Agatha.');

    const layer = page.locator('[data-about-root] > svg');
    await expect(layer).toHaveAttribute('aria-hidden', 'true');

    // O título termina escrito: a raiz ganha `data-pen-done` e as palavras ficam no lugar, sem deslocamento.
    await expect(page.locator('[data-about-root]')).toHaveAttribute('data-pen-done', '');
    const words = page.locator('h1 [data-pen-word]');
    await expect(words).toHaveCount(5);
    for (const word of await words.all()) await expect(word).toHaveCSS('transform', 'none');

    // No topo, o título já tem o traço; a chamada final, lá embaixo, ainda não.
    await expect(page.locator('h1 [data-pencil][data-drawn]')).toHaveCount(1);
    await expect(page.locator('[data-about="cta"] [data-pencil][data-drawn]')).toHaveCount(0);

    // Rolando até o fim, todos os traços acabam desenhados, um grupo por trecho.
    const targets = await page.locator('[data-pencil]').count();
    for (const part of ['how', 'stats', 'rules', 'app', 'cta']) {
      await page.locator(`[data-about="${part}"]`).scrollIntoViewIfNeeded();
    }
    await expect(page.locator('[data-pencil][data-drawn]')).toHaveCount(targets);
    // O itálico só ganha o marca-texto (CSS); os demais, um grupo na camada.
    const marks = await page.locator('[data-pencil="mark"]').count();
    await expect(layer.locator('g[data-drawn]')).toHaveCount(targets - marks);
    expect(await page.locator('em[data-pencil="mark"]').count()).toBeGreaterThan(0);

    // A camada não pega cliques nem cria rolagem lateral.
    expect(await layer.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test('com menos movimento, o título já aparece inteiro e os traços não animam', async ({
    browser,
    guard,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', ignoreHTTPSErrors: true });
    guard.watchContext(context);
    const page = await context.newPage();
    await page.goto('/sobre');
    const word = page.locator('h1 [data-pen-word]').first();
    expect(await word.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await expect(word).toHaveCSS('transform', 'none');
    // Os traços aparecem prontos: nenhum caminho fica tracejado (escondido). `toHaveCSS` espera: a camada é refeita
    // quando a fonte chega, e um caminho antigo sai do DOM.
    await expect(page.locator('h1 [data-pencil][data-drawn]')).toHaveCount(1);
    await expect(page.locator('[data-about-root] > svg g[data-drawn] path').first()).toHaveCSS(
      'stroke-dasharray',
      'none',
    );
    await context.close();
  });
});
