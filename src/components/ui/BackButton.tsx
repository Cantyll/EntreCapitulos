import type { Route } from 'next';
import type { ReactNode } from 'react';

import styles from './BackButton.module.css';
import { ButtonLink } from './Button';
import { Icon } from './Icon';

type BackButtonProps = {
  /** Página "pai" (destino do botão). */
  href: Route;
  /** Texto do botão. Prefira algo que diga para onde volta ("Voltar para Sessões"). */
  children?: ReactNode;
  className?: string;
};

/**
 * Caminho de volta visível nas páginas internas. No app instalado não existe botão voltar do
 * navegador, então toda página interna usa este botão no topo.
 *
 * É sempre um link para a página pai, e não um history.back(), de propósito:
 * - funciona em link direto e sem JavaScript;
 * - não sai do app: o histórico pode ter páginas de fora (login com o Google, por exemplo);
 * - não "volta" só um âncora (#capitulo-10) dentro da mesma página.
 */
export function BackButton({ href, children = 'Voltar', className }: BackButtonProps) {
  return (
    <ButtonLink href={href} variant="ghost" size="sm" className={className}>
      <Icon name="left" size="sm" />
      <span className={styles.label}>{children}</span>
    </ButtonLink>
  );
}
