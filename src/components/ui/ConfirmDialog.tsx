'use client';

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

import styles from './ConfirmDialog.module.css';

/**
 * Confirmação em <dialog> nativo: foco preso, Esc fecha (bloqueado enquanto `busy`), foco devolvido a quem
 * abriu. No desktop é uma caixa centralizada; em tela de toque (`pointer: coarse`) vira folha inferior, com
 * safe areas, altura em `dvh` e rolagem interna, e sobe acima do teclado do iPhone (`visualViewport`) quando
 * há um campo de texto dentro dela. `error` aparece dentro, sem fechar. Em diálogo de perigo o foco inicial
 * vai para "Cancelar", nunca para o botão que destrói.
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  busyLabel,
  busy,
  danger,
  disabled,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  danger?: boolean;
  /** Impede confirmar (ex.: o conteúdo ainda tem problema que bloqueia, ou o texto digitado não confere). */
  disabled?: boolean;
  error?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const keyboard = useKeyboardInset();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      if (danger) cancelRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, danger]);

  function handleClose() {
    // O foco volta ao botão que abriu o diálogo (o navegador também tenta; aqui fica garantido).
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected) target.focus();
    onClose();
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      style={{ '--kb': `${keyboard}px` } as CSSProperties}
      onClose={handleClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <div className={styles.body}>
        <h2 id={titleId}>{title}</h2>
        {children}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button
            variant={danger ? 'ghost' : 'primary'}
            danger={danger}
            disabled={busy || disabled}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
          <Button ref={cancelRef} variant="soft" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </dialog>
  );
}
