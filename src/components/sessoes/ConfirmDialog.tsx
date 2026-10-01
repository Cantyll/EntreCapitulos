'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';

import styles from './sessoes.module.css';

/** Confirmação em <dialog> nativo (foco preso, Esc fecha). `error` aparece dentro, sem fechar. */
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
  /** Impede confirmar (ex.: o conteúdo ainda tem problema que bloqueia). */
  disabled?: boolean;
  error?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="dialogo-titulo"
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <div className={styles.dialogBody}>
        <h2 id="dialogo-titulo">{title}</h2>
        {children}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.rowActions}>
          <Button
            variant={danger ? 'ghost' : 'primary'}
            danger={danger}
            disabled={busy || disabled}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
          <Button variant="soft" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </dialog>
  );
}
