import { describe, expect, it } from 'vitest';

import { shouldTrackNavigation, type AnchorInfo, type ClickInfo } from './navigation-progress';

const click: ClickInfo = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};
const link = (href: string, extra: Partial<AnchorInfo> = {}): AnchorInfo => ({
  href,
  target: '',
  download: false,
  ...extra,
});
const HERE = 'https://entrecapitulos.blog.br/sessoes';

describe('shouldTrackNavigation', () => {
  it('conta a navegação interna para outra página', () => {
    expect(shouldTrackNavigation(click, link('https://entrecapitulos.blog.br/estante'), HERE)).toBe(
      true,
    );
  });

  it('conta outra consulta da mesma página (abas, filtros, paginação)', () => {
    expect(
      shouldTrackNavigation(
        click,
        link('https://entrecapitulos.blog.br/sessoes?ordem=antigos'),
        HERE,
      ),
    ).toBe(true);
  });

  it('ignora o mesmo endereço e a troca só da âncora', () => {
    expect(shouldTrackNavigation(click, link(HERE), HERE)).toBe(false);
    expect(shouldTrackNavigation(click, link(`${HERE}#ch-3`), HERE)).toBe(false);
  });

  it('ignora outro site e protocolos que não são de página', () => {
    expect(shouldTrackNavigation(click, link('https://exemplo.com/sessoes'), HERE)).toBe(false);
    expect(shouldTrackNavigation(click, link('mailto:alguem@exemplo.com'), HERE)).toBe(false);
  });

  it('ignora nova aba, download, tecla modificadora, botão do meio e clique já tratado', () => {
    const to = link('https://entrecapitulos.blog.br/estante');
    expect(shouldTrackNavigation(click, { ...to, target: '_blank' }, HERE)).toBe(false);
    expect(shouldTrackNavigation(click, { ...to, download: true }, HERE)).toBe(false);
    expect(shouldTrackNavigation({ ...click, metaKey: true }, to, HERE)).toBe(false);
    expect(shouldTrackNavigation({ ...click, ctrlKey: true }, to, HERE)).toBe(false);
    expect(shouldTrackNavigation({ ...click, shiftKey: true }, to, HERE)).toBe(false);
    expect(shouldTrackNavigation({ ...click, altKey: true }, to, HERE)).toBe(false);
    expect(shouldTrackNavigation({ ...click, button: 1 }, to, HERE)).toBe(false);
    expect(shouldTrackNavigation({ ...click, defaultPrevented: true }, to, HERE)).toBe(false);
  });

  it('aceita target _self e ignora endereço que não é uma URL', () => {
    expect(
      shouldTrackNavigation(
        click,
        link('https://entrecapitulos.blog.br/estante', { target: '_self' }),
        HERE,
      ),
    ).toBe(true);
    expect(shouldTrackNavigation(click, link('::::'), HERE)).toBe(false);
  });
});
