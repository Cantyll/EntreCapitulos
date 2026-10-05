'use client';

import { useId, useState, useTransition } from 'react';

import { deleteMember } from '@/app/painel/membros/actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DELETE_CONFIRMATION } from '@/lib/account/messages';
import { isDeleteConfirmed } from '@/lib/members/confirm';
import { commentsLine, repliesLine } from '@/lib/members/deletion-text';

import styles from './members.module.css';

type Props = {
  memberId: string;
  name: string;
  /** Contagens feitas no servidor: comentários da pessoa e respostas de OUTRAS pessoas a eles. */
  impact: { comments: number | null; replies: number | null };
  isStaff: boolean;
};

/** Excluir a conta de um membro: contagens reais, avisos e `EXCLUIR` digitado (conferido de novo no servidor). */
export function DeleteControl({ memberId, name, impact, isStaff }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = useId();

  function close() {
    if (pending) return;
    setOpen(false);
    setTyped('');
    setError(null);
  }

  function confirm() {
    startTransition(async () => {
      // Em caso de sucesso a action redireciona para a lista e esta tela sai de cena.
      const result = await deleteMember(memberId, typed);
      if (result && !result.ok) setError(result.message);
    });
  }

  return (
    <section
      className={`${styles.card} ${styles.section}`}
      aria-labelledby="excluir-titulo"
      data-tour="member-delete"
    >
      <h2 id="excluir-titulo">Excluir conta</h2>
      {isStaff ? (
        <p>
          Esta conta tem cargo de equipe. Para excluí-la, primeiro mude o cargo para Membro (em
          &ldquo;Cargo&rdquo;).
        </p>
      ) : (
        <>
          <p>
            Apaga a conta, os comentários e o progresso de leitura desta pessoa. Não tem volta. Para
            abuso, prefira suspender os comentários.
          </p>
          <div className={styles.fieldRow}>
            <Button variant="ghost" danger onClick={() => setOpen(true)}>
              Excluir conta…
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={open}
        title={`Excluir a conta de ${name}?`}
        confirmLabel="Excluir conta"
        busyLabel="Excluindo…"
        busy={pending}
        danger
        initialFocus="cancel"
        disabled={!isDeleteConfirmed(typed)}
        error={error}
        onConfirm={confirm}
        onClose={close}
      >
        <div className={styles.dialogText}>
          <p>
            <strong>Não há volta.</strong> Ao excluir:
          </p>
          <ul>
            <li>o perfil, o e-mail e o progresso de leitura saem do site;</li>
            <li>{commentsLine(impact.comments)}</li>
            <li>{repliesLine(impact.replies)}</li>
          </ul>
          <p>
            As cópias de segurança podem guardar esses dados até cada cópia expirar. Antes de
            excluir, faça um backup manual do banco.
          </p>
          <p>
            Excluir a conta <strong>não impede</strong> a pessoa de criar outra. Para abuso, use
            &ldquo;Suspender comentários&rdquo;.
          </p>
          <label htmlFor={inputId} className={styles.dialogField}>
            Para confirmar, digite {DELETE_CONFIRMATION}
            <input
              id={inputId}
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
        </div>
      </ConfirmDialog>
    </section>
  );
}
