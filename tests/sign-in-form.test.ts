import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// O formulário importa as Server Actions; aqui só interessa o que ele desenha.
vi.mock('@/app/(public)/entrar/actions', () => ({
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

const { SignInForm } = await import('@/components/auth/SignInForm');

const render = (props: { googleEnabled?: boolean } = {}) =>
  renderToStaticMarkup(createElement(SignInForm, { next: '/', initialError: null, ...props }));

describe('SignInForm', () => {
  it('esconde "Continuar com Google" por padrão', () => {
    const html = render();
    expect(html).not.toContain('Continuar com Google');
    expect(html).not.toContain('>ou<');
  });

  it('mantém o login por código de e-mail quando o Google está desligado', () => {
    const html = render();
    expect(html).toContain('Receber código por e-mail');
    expect(html).toContain('name="email"');
  });

  it('mostra o botão e o separador quando o Google está ligado', () => {
    const html = render({ googleEnabled: true });
    expect(html).toContain('Continuar com Google');
    expect(html).toContain('>ou<');
  });
});
