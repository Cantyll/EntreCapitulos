import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('redirect');
  },
  usePathname: () => '/sessoes',
}));
vi.mock('@/app/(public)/boas-vindas/actions', () => ({ completeWelcome: async () => ({}) }));

const { WelcomeForm } = await import('@/components/auth/WelcomeForm');
const { TermsNoticeBar } = await import('@/components/legal/TermsNoticeBar');

const render = (props: { askName: boolean; askTerms: boolean }) =>
  renderToStaticMarkup(createElement(WelcomeForm, { next: '/sessoes', initialName: '', ...props }));

describe('caixa do aceite em /boas-vindas', () => {
  it('nunca vem marcada, é obrigatória e tem rótulo associado, com links para os dois textos', () => {
    const html = render({ askName: true, askTerms: true });
    const input = html.match(/<input[^>]*name="acceptTerms"[^>]*>/)?.[0] ?? '';
    expect(input).toContain('type="checkbox"');
    expect(input).toContain('required');
    expect(input).not.toMatch(/\bchecked\b/);
    const id = input.match(/id="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    const label = html.match(/<label[^>]*for="aceite"[^>]*>[\s\S]*?<\/label>/)?.[0] ?? '';
    expect(label.replace(/<[^>]+>/g, '')).toBe(
      'Declaro que tenho 18 anos ou mais e li os Termos de Uso e a Política de Privacidade',
    );
    expect(label).toContain('href="/termos"');
    expect(label).toContain('href="/privacidade"');
  });

  it('o rótulo não diz que a idade foi verificada: é uma declaração', () => {
    const html = render({ askName: true, askTerms: true });
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/verificad|confirmad|comprovad/i);
  });

  it('só o aceite (nome já escolhido): sem campo de nome, com a caixa', () => {
    const html = render({ askName: false, askTerms: true });
    expect(html).toContain('name="acceptTerms"');
    expect(html).not.toContain('name="displayName"');
  });

  it('só o nome (aceite já dado): sem a caixa', () => {
    const html = render({ askName: true, askTerms: false });
    expect(html).toContain('name="displayName"');
    expect(html).not.toContain('name="acceptTerms"');
  });
});

describe('aviso do aceite (faixa)', () => {
  const bar = (props: { status: 'missing' | 'outdated'; staff: boolean }) =>
    renderToStaticMarkup(createElement(TermsNoticeBar, props));

  it('membro que nunca aceitou: diz que sem aceitar só dá para ler, com o caminho para aceitar', () => {
    const html = bar({ status: 'missing', staff: false });
    expect(html).toContain('data-terms-notice="missing"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Aviso sobre os Termos"');
    expect(html).toContain('href="/boas-vindas?next=%2Fsessoes"');
    expect(html).toContain('você pode ler, mas não pode comentar');
  });

  it('equipe: o aviso não diz que ela não pode comentar (é isenta)', () => {
    const html = bar({ status: 'missing', staff: true });
    expect(html).toContain('Falta aceitar os Termos de Uso');
    expect(html).not.toContain('não pode comentar');
  });

  it('versão antiga: pede para ler e aceitar de novo', () => {
    const html = bar({ status: 'outdated', staff: false });
    expect(html).toContain('data-terms-notice="outdated"');
    expect(html).toContain('Atualizamos os Termos de Uso');
    expect(html).toContain('Ler e aceitar');
  });

  it('nenhum texto do aviso diz que a idade foi verificada', () => {
    for (const status of ['missing', 'outdated'] as const) {
      for (const staff of [true, false]) {
        expect(bar({ status, staff }).replace(/<[^>]+>/g, ' ')).not.toMatch(
          /verificad|confirmad|comprovad/i,
        );
      }
    }
  });
});
