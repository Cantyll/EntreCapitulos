'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';

import { useIsStandalone } from '@/hooks/useIsStandalone';

import { ButtonLink } from './Button';
import { Icon } from './Icon';

type BackButtonProps = {
  /** Página "pai": destino do link e plano B quando não há histórico para voltar. */
  fallbackHref: Route;
  /** Texto do botão. Prefira algo que diga para onde volta ("Voltar para Sessões"). */
  children?: ReactNode;
  className?: string;
};

/**
 * Caminho de volta visível nas páginas internas. No app instalado não existe botão voltar do
 * navegador, então toda página interna usa este botão no topo.
 *
 * É sempre um link para a página pai (funciona sem JavaScript e em link direto). Só no app
 * instalado, havendo histórico, ele volta para a tela anterior, como um botão voltar nativo. No
 * navegador o histórico pode incluir outros sites, então ali o botão leva ao pai.
 */
export function BackButton({ fallbackHref, children = 'Voltar', className }: BackButtonProps) {
  const router = useRouter();
  const standalone = useIsStandalone();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!standalone || window.history.length <= 1) return;
    event.preventDefault();
    router.back();
  }

  return (
    <ButtonLink
      href={fallbackHref}
      variant="ghost"
      size="sm"
      className={className}
      onClick={handleClick}
    >
      <Icon name="left" size="sm" />
      {children}
    </ButtonLink>
  );
}
