import { cx } from '@/lib/cx';

import styles from './Icon.module.css';
import { iconPaths, type IconName } from './icon-paths';

export type { IconName };

type IconProps = {
  name: IconName;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

/** Ícone decorativo. Botão ou link só com ícone precisa de aria-label no próprio elemento. */
export function Icon({ name, size = 'md', className }: IconProps) {
  return (
    <svg
      className={cx(styles.icon, size === 'sm' && styles.sm, size === 'lg' && styles.lg, className)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[name]}
    </svg>
  );
}
