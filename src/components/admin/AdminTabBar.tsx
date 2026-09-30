'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import type { Role } from '@/lib/auth/roles';
import { cx } from '@/lib/cx';
import {
  NEW_SESSION_HREF,
  getAdminTabbar,
  isAdminNavActive,
  type AdminNavItem,
} from '@/lib/navigation';

import styles from './AdminTabBar.module.css';

/**
 * Barra inferior fixa do painel no celular (abaixo de 1020px): Visão geral, Sessões, o botão
 * central "Nova sessão", Comentários (com contador) e "Mais", que abre uma folha com o resto.
 * Acima de 1020px ela some e vale a barra lateral.
 */
export function AdminTabBar({ pendingComments, role }: { pendingComments: number; role: Role }) {
  const pathname = usePathname();
  const { left, right, more, canCreateSession } = getAdminTabbar(role);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const sheetTitleId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreActive = more.some((item) => isAdminNavActive(item, pathname));

  // A folha fecha sozinha quando a rota muda (link dentro dela, botão voltar do navegador...).
  useEffect(() => {
    sheetRef.current?.close();
  }, [pathname]);

  function openSheet() {
    sheetRef.current?.showModal();
    setSheetOpen(true);
  }

  function closeSheet() {
    sheetRef.current?.close();
  }

  // Num <dialog> modal, o clique no fundo escurecido chega com o próprio <dialog> como alvo.
  function closeOnBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) closeSheet();
  }

  function renderTab(item: AdminNavItem) {
    const active = isAdminNavActive(item, pathname);
    return (
      <li key={item.href} className={styles.cell}>
        <Link
          href={item.href}
          className={cx(styles.tab, active && styles.on)}
          aria-current={active ? 'page' : undefined}
        >
          <span className={styles.pill}>
            <Icon name={item.icon} size="lg" />
            {item.pendingBadge && pendingComments > 0 && (
              <span className={styles.badge}>
                {pendingComments}
                <VisuallyHidden> para aprovar</VisuallyHidden>
              </span>
            )}
          </span>
          <span>{item.label}</span>
        </Link>
      </li>
    );
  }

  return (
    <div className={styles.root}>
      <nav className={styles.bar} aria-label="Painel">
        <ul className={styles.list}>
          {left.map(renderTab)}
          {canCreateSession && (
            <li className={styles.cell}>
              <Link href={NEW_SESSION_HREF} className={styles.create}>
                <span className={styles.createIcon}>
                  <Icon name="pen" size="lg" />
                </span>
                <span>Nova sessão</span>
              </Link>
            </li>
          )}
          {right.map(renderTab)}
          {more.length > 0 && (
            <li className={styles.cell}>
              <button
                type="button"
                className={cx(styles.tab, moreActive && styles.on)}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                onClick={openSheet}
              >
                <span className={styles.pill}>
                  <Icon name="more" size="lg" />
                </span>
                <span>Mais</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      <dialog
        ref={sheetRef}
        className={styles.sheet}
        aria-labelledby={sheetTitleId}
        onClick={closeOnBackdropClick}
        onClose={() => setSheetOpen(false)}
      >
        <div className={styles.sheetBody}>
          <div className={styles.sheetHead}>
            <h2 id={sheetTitleId}>Mais</h2>
            <IconButton label="Fechar" size="sm" onClick={closeSheet}>
              <Icon name="x" size="sm" />
            </IconButton>
          </div>
          <ul className={styles.sheetList}>
            {more.map((item) => {
              const active = isAdminNavActive(item, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cx(styles.sheetLink, active && styles.sheetOn)}
                    aria-current={active ? 'page' : undefined}
                    onClick={closeSheet}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li className={styles.sheetDivider} aria-hidden="true" />
            <li>
              <Link href="/" className={styles.sheetLink} onClick={closeSheet}>
                <Icon name="eye" />
                Ver o site
              </Link>
            </li>
          </ul>
        </div>
      </dialog>
    </div>
  );
}
