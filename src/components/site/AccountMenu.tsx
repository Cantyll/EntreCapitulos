'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { signOut } from '@/lib/auth/actions';

import styles from './AccountMenu.module.css';

type AccountMenuProps = {
  name: string;
  /** Rótulo do papel ("Administradora", "Moderadora"); só para a equipe. */
  roleLabel?: string;
  /** Link do painel; só para a equipe. */
  panelHref?: Route;
};

/** Menu de conta do cabeçalho: avatar, nome, "Ir ao painel" (equipe) e "Sair". */
export function AccountMenu({ name, roleLabel, panelHref }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const pathname = usePathname();

  // Fecha quando a rota muda.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-label={`Conta de ${name}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={name} size="sm" />
      </button>
      <div id={menuId} className={styles.panel} hidden={!open}>
        <div className={styles.who}>
          <b>{name}</b>
          {roleLabel && <small>{roleLabel}</small>}
        </div>
        <ul className={styles.list}>
          {panelHref && (
            <li>
              <Link href={panelHref} className={styles.item}>
                <Icon name="settings" size="sm" />
                Ir ao painel
              </Link>
            </li>
          )}
          <li>
            <form action={signOut}>
              <button type="submit" className={styles.item}>
                <Icon name="logout" size="sm" />
                Sair
              </button>
            </form>
          </li>
        </ul>
      </div>
    </div>
  );
}
