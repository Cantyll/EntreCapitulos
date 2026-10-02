import { expect, type Locator } from '@playwright/test';

/**
 * Espera o React "assumir" o elemento. Digitar num campo controlado antes da hidratação perde o texto
 * (o React o sobrescreve ao hidratar). O React marca cada nó que hidratou com uma chave `__reactProps$…`.
 */
export async function untilHydrated(locator: Locator): Promise<void> {
  await expect
    .poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__reactProps$'))), {
      message: 'a página ainda não hidratou',
    })
    .toBe(true);
}

/**
 * Preenche um campo controlado e espera o botão que depende dele habilitar. Se a tela se refizer logo
 * depois de uma ação anterior (o servidor devolve a lista nova), o texto digitado pode se perder: o
 * `toPass` repete o preenchimento até o estado do React acompanhar. Não cria nada por conta própria.
 */
export async function fillUntilEnabled(field: Locator, value: string, button: Locator): Promise<void> {
  await expect(async () => {
    await field.fill(value);
    await expect(button).toBeEnabled({ timeout: 1_500 });
  }).toPass({ timeout: 10_000 });
}
