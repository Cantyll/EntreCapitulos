import Link from 'next/link';
import type { ComponentProps } from 'react';

import { cx } from '@/lib/cx';

import styles from './Button.module.css';

type ButtonStyleProps = {
  variant?: 'primary' | 'soft' | 'ghost';
  size?: 'md' | 'sm' | 'lg';
  /** Ocupa a largura toda do contêiner. */
  block?: boolean;
  /** Texto em vermelho; só combina com variant="ghost". */
  danger?: boolean;
};

function buttonClass({
  variant = 'primary',
  size = 'md',
  block,
  danger,
  className,
}: ButtonStyleProps & { className?: string }) {
  return cx(
    styles.btn,
    styles[variant],
    size === 'sm' && styles.sm,
    size === 'lg' && styles.lg,
    block && styles.block,
    danger && styles.danger,
    className,
  );
}

export function Button({
  variant,
  size,
  block,
  danger,
  className,
  type = 'button',
  ...rest
}: ButtonStyleProps & ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, danger, className })}
      {...rest}
    />
  );
}

/** Link com cara de botão. Para navegar entre páginas use sempre este, nunca <a> ou Button. */
export function ButtonLink({
  variant,
  size,
  block,
  danger,
  className,
  ...rest
}: ButtonStyleProps & ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size, block, danger, className })} {...rest} />;
}

/** Link com cara de botão para um ARQUIVO (download) ou endereço fora das páginas: `<a>` comum, sem o roteador. */
export function ButtonAnchor({
  variant,
  size,
  block,
  danger,
  className,
  ...rest
}: ButtonStyleProps & ComponentProps<'a'>) {
  return <a className={buttonClass({ variant, size, block, danger, className })} {...rest} />;
}
