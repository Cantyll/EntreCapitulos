'use client';

import { useState, useTransition } from 'react';

import { setMemberSuspension } from '@/app/painel/membros/actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

import styles from './members.module.css';
import { ResultNotice } from './ResultNotice';
import { StatusPill } from './RoleBadge';

type Props = {
  memberId: string;
  name: string;
  /** `null`: não deu para ler a situação (tabela ausente ou erro). */
  suspended: boolean | null;
  /** Quem tem cargo de equipe não tem os comentários suspensos: o cargo sai antes. */
  isStaff: boolean;
};

/** Suspender e reativar os comentários de um membro, com diálogo de confirmação. */
export function SuspensionControl({ memberId, name, suspended, isStaff }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function confirm() {
    startTransition(async () => {
      const result = await setMemberSuspension(memberId, suspended !== true);
      if (result.ok) {
        setOpen(false);
        setError(null);
        setNotice(result);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <section
      className={`${styles.card} ${styles.section}`}
      aria-labelledby="suspensao-titulo"
      data-tour="member-suspend"
    >
      <h2 id="suspensao-titulo">Comentários</h2>
      <p>
        Situação: <StatusPill suspended={isStaff ? false : suspended} />
      </p>
      {isStaff ? (
        <p>
          Quem tem cargo de equipe não tem os comentários suspensos. Para suspender, mude o cargo
          para Membro antes.
        </p>
      ) : suspended === null ? (
        <p>Não foi possível ler a situação agora. Atualize a página.</p>
      ) : (
        <div className={styles.fieldRow}>
          <Button
            variant={suspended ? 'soft' : 'ghost'}
            danger={!suspended}
            onClick={() => {
              setNotice(null);
              setOpen(true);
            }}
          >
            {suspended ? 'Reativar comentários…' : 'Suspender comentários…'}
          </Button>
        </div>
      )}
      <ResultNotice result={notice} />

      <ConfirmDialog
        open={open}
        title={
          suspended ? `Reativar os comentários de ${name}?` : `Suspender os comentários de ${name}?`
        }
        confirmLabel={suspended ? 'Reativar comentários' : 'Suspender comentários'}
        busyLabel={suspended ? 'Reativando…' : 'Suspendendo…'}
        busy={pending}
        danger={!suspended}
        error={error}
        onConfirm={confirm}
        onClose={close}
      >
        <div className={styles.dialogText}>
          {suspended ? (
            <p>
              A pessoa volta a poder comentar e responder, com as regras de sempre da moderação.
            </p>
          ) : (
            <>
              <p>
                A pessoa continua lendo o site e usando Minha conta, mas não consegue publicar
                comentários nem respostas. Quem tenta vê o aviso &ldquo;Seus comentários estão
                suspensos&rdquo;, sem motivo nem data.
              </p>
              <p>
                Os comentários que ela já publicou continuam como estão, e ela ainda pode excluir os
                próprios. Dá para reativar quando quiser.
              </p>
            </>
          )}
        </div>
      </ConfirmDialog>
    </section>
  );
}
