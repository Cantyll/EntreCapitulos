import type { CSSProperties } from 'react';

import { avatarTone, getInitials } from '@/lib/avatar';
import { cx } from '@/lib/cx';

import styles from './Avatar.module.css';

type AvatarProps = {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

/** Decorativo: o nome da pessoa sempre aparece como texto ao lado. */
export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <div
      className={cx(styles.avatar, size !== 'md' && styles[size], className)}
      style={{ '--av': avatarTone(name) } as CSSProperties}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}
