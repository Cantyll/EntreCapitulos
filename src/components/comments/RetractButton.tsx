'use client';

import { useRef, useState, useTransition } from 'react';

import { retractComment } from '@/app/(public)/comment-actions';
import { Icon } from '@/components/ui/Icon';

import styles from './comments.module.css';

type Props = {
  commentId: string;
  /** Quantas respostas de outras pessoas ficam sem o comentário (só o de nível superior). */
  replyCount: number;
  onDeleted: () => void;
};

/**
 * "Excluir meu comentário", com confirmação na própria linha (sem `window.confirm`, que o iOS no app
 * instalado trata mal). A exclusão apaga o texto no banco e não tem volta.
 */
export function RetractButton({ commentId, replyCount, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function confirm() {
    setError('');
    startTransition(async () => {
      const result = await retractComment(commentId);
      if (result.ok) {
        onDeleted();
      } else {
        setError(result.message);
      }
    });
  }

  function cancel() {
    setConfirming(false);
    setError('');
    // O botão que abriu a confirmação volta a existir no próximo render.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  if (!confirming) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className={styles.actionButton}
        onClick={() => setConfirming(true)}
      >
        <Icon name="trash" size="sm" />
        Excluir meu comentário
      </button>
    );
  }

  return (
    <div className={styles.retract} role="group" aria-label="Confirmar exclusão do comentário">
      <p>
        Excluir este comentário? O texto é apagado e não dá para desfazer.
        {replyCount > 0 && ' As respostas a ele também deixam de aparecer.'}
      </p>
      {error && (
        <p role="alert" className={styles.retractError}>
          {error}
        </p>
      )}
      <div className={styles.retractButtons}>
        <button
          type="button"
          className={styles.retractDanger}
          onClick={confirm}
          disabled={pending}
          autoFocus
        >
          {pending ? 'Excluindo…' : 'Excluir'}
        </button>
        <button type="button" className={styles.retractCancel} onClick={cancel} disabled={pending}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
