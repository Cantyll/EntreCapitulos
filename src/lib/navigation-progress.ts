/*
 * Regras puras da linha de progresso da navegação (`NavigationProgress`): quando um clique em link vira uma
 * navegação que merece o sinal, e quanto tempo o sinal pode esperar. Sem DOM, para testar sem navegador.
 */

/** Se a página nova não chegar até aqui (rede parada, erro), a linha some sozinha. */
export const PROGRESS_TIMEOUT_MS = 12_000;

export type ClickInfo = {
  /** `MouseEvent.button`: só o botão principal (0) navega. */
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

export type AnchorInfo = {
  /** `href` já resolvido contra a página atual (`anchor.href`). */
  href: string;
  /** Atributo `target` do link ("" quando não há). */
  target: string;
  /** O link tem o atributo `download`. */
  download: boolean;
};

/**
 * O clique é uma navegação interna a outra página (ou outra consulta da mesma página)? Fora disso (nova aba, tecla
 * modificadora, download, outro site, só a âncora `#`, o mesmo endereço) nada muda na tela e a linha não aparece.
 */
export function shouldTrackNavigation(
  click: ClickInfo,
  anchor: AnchorInfo,
  currentHref: string,
): boolean {
  if (click.defaultPrevented || click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (anchor.download) return false;
  if (anchor.target !== '' && anchor.target !== '_self') return false;

  let next: URL;
  let current: URL;
  try {
    next = new URL(anchor.href);
    current = new URL(currentHref);
  } catch {
    return false;
  }
  if (next.origin !== current.origin) return false;
  if (next.protocol !== 'http:' && next.protocol !== 'https:') return false;
  // Mesma página e mesma consulta: só muda a âncora, ou nada.
  return next.pathname !== current.pathname || next.search !== current.search;
}
