/*
 * Badge do ícone do app (PWA instalado): a contagem de comentários pendentes. Função pura e testável: recebe o
 * `navigator` (ou algo parecido), não faz nada onde a API não existe e nunca lança.
 *
 * O erro da chamada é descartado de propósito, sem log: onde a API existe mas a pessoa não permitiu
 * (no iPhone o selo costuma exigir a permissão de notificações do app instalado, que o site não pede),
 * a promessa é recusada em TODA atualização, e isso não é uma falha do site. Não há dado pessoal nenhum aqui.
 */

export type BadgeNavigator = {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** Contagem válida para o selo: inteiro de 0 a 99999; qualquer outra coisa vira 0 (sem selo). */
export function normalizeBadgeCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 99999
    ? value
    : 0;
}

/** `true` se o navegador tem a API de selo. */
export function supportsAppBadge(nav: BadgeNavigator | undefined): nav is BadgeNavigator {
  return typeof nav?.setAppBadge === 'function';
}

export async function applyAppBadge(nav: BadgeNavigator | undefined, count: number): Promise<void> {
  if (!supportsAppBadge(nav)) return;
  const n = normalizeBadgeCount(count);
  try {
    if (n > 0) {
      await nav.setAppBadge?.(n);
    } else if (typeof nav.clearAppBadge === 'function') {
      await nav.clearAppBadge();
    } else {
      await nav.setAppBadge?.(0);
    }
  } catch {
    // Ver o comentário no topo: recusa esperada, sem dado para registrar.
  }
}
