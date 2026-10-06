import { expect, type Page } from '@playwright/test';

/*
 * Ajudantes dos testes da página Sobre (etapa 8j). A ordem dos blocos vem dos atributos `data-about` do `AboutView`.
 */

/** A ordem esperada na página pública: apresentação, texto, seções extras, Como funciona, estatísticas, Combinados, app, chamada. */
export const SOBRE_ORDER = [
  'presentation',
  'text',
  'sections',
  'how',
  'stats',
  'rules',
  'app',
  'cta',
] as const;

/** A ordem dos blocos marcados com `data-about`, sem repetir seguidos (o título e o cartão são ambos "presentation"). */
export async function blockOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const element of document.querySelectorAll('[data-about]')) {
      const value = element.getAttribute('data-about')!;
      if (out.at(-1) !== value) out.push(value);
    }
    return out;
  });
}

/** Sem rolagem horizontal na largura dada (na janela e no corpo da página). */
export async function expectNoHorizontalScroll(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  // O layout por container query reage ao redimensionamento: espera um quadro.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  const overflow = await page.evaluate(() => ({
    html: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow, `rolagem horizontal em ${width}px`).toEqual({ html: 0, body: 0 });
}

/** As larguras do teste de regressão do layout por container query. */
export const WIDTHS = [320, 390, 820, 1280] as const;

/** O texto digitado no editor de texto rico (o campo se acha pelo nome acessível, que vem do rótulo). */
export async function typeInRichField(page: Page, name: string, text: string): Promise<void> {
  const field = page.getByRole('textbox', { name, exact: true });
  await field.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
}
