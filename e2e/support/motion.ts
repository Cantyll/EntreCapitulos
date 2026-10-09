import type { Page } from '@playwright/test';

/**
 * Espera as animações e transições finitas da página terminarem (a entrada de um diálogo, o retorno de um botão
 * depois do toque). Medir tamanho ou contraste no meio delas lê um quadro intermediário: o botão ainda encolhido
 * pelo toque, o texto do menu ainda esmaecido. As infinitas (esqueleto de carregamento) ficam de fora.
 */
export async function untilMotionSettles(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}
