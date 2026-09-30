import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/lib/cx';

import styles from './IconButton.module.css';

type IconButtonStyleProps = {
  /** Obrigatório: botão só com ícone precisa de nome acessível. */
  label: string;
  size?: 'md' | 'sm';
  /** Ponto de aviso no canto (ex.: comentários esperando aprovação). */
  dot?: boolean;
  children: ReactNode;
};

function Content({ dot, children }: Pick<IconButtonStyleProps, 'dot' | 'children'>) {
  return (
    <>
      {children}
      {dot && <i className={styles.dot} aria-hidden="true" />}
    </>
  );
}

export function IconButton({
  label,
  size = 'md',
  dot,
  className,
  children,
  type = 'button',
  ...rest
}: IconButtonStyleProps & Omit<ComponentProps<'button'>, 'aria-label' | 'children'>) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(styles.iconBtn, size === 'sm' && styles.sm, className)}
      {...rest}
    >
      <Content dot={dot}>{children}</Content>
    </button>
  );
}

export function IconLink({
  label,
  size = 'md',
  dot,
  className,
  children,
  ...rest
}: IconButtonStyleProps & Omit<ComponentProps<typeof Link>, 'aria-label' | 'children'>) {
  return (
    <Link
      aria-label={label}
      className={cx(styles.iconBtn, size === 'sm' && styles.sm, className)}
      {...rest}
    >
      <Content dot={dot}>{children}</Content>
    </Link>
  );
}
