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
