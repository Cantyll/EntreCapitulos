'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { signOut } from '@/lib/auth/sign-out';

import styles from './AccountMenu.module.css';

type AccountMenuProps = {
  displayName: string;
  /** Destino de "Ir ao painel"; ausente para quem não é da equipe. */
  panelHref?: '/painel' | '/painel/comentarios';
};

/** Avatar com o menu da conta (padrão de disclosure: botão, lista, Esc e clique fora fecham). */
export function AccountMenu({ displayName, panelHref }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

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
    <div className={styles.root} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Menu da conta de ${displayName}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={displayName} size="sm" />
      </button>
      {open && (
        <div id={menuId} className={styles.menu}>
          <p className={styles.name}>{displayName}</p>
          {panelHref && (
            <Link href={panelHref} className={styles.item} onClick={() => setOpen(false)}>
              <Icon name="home" size="sm" />
              Ir ao painel
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" className={styles.item}>
              <Icon name="logout" size="sm" />
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
