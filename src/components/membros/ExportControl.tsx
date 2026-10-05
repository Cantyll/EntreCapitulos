'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { adminMemberHref } from '@/lib/routes';

import styles from './members.module.css';

/**
 * Baixar os dados da pessoa. O arquivo vem de um POST (um `<form>` comum, sem JavaScript no meio): quem confirma
 * no diálogo envia o formulário, e o navegador baixa o anexo sem sair da página. Se o servidor não puder gerar o
 * arquivo, ele volta para este perfil com um aviso. A ação fica registrada na auditoria.
 */
export function ExportControl({ memberId }: { memberId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function confirm() {
    setBusy(true);
    formRef.current?.requestSubmit();
    // O download não avisa quando começa: fecha o diálogo logo depois do envio.
    window.setTimeout(() => {
      setBusy(false);
      setOpen(false);
    }, 1200);
  }

  return (
    <section
      className={`${styles.card} ${styles.section}`}
      aria-labelledby="dados-titulo"
      data-tour="member-export"
    >
      <h2 id="dados-titulo">Dados da pessoa</h2>
      <p>
        Um arquivo com o perfil, o e-mail, os comentários (em todos os estados) e o progresso de
        leitura desta pessoa, para atender um pedido dela sobre os próprios dados.
      </p>
      <form ref={formRef} method="post" action={`${adminMemberHref(memberId)}/dados`} hidden />
      <div className={styles.fieldRow}>
        <Button variant="soft" onClick={() => setOpen(true)}>
          Baixar dados da pessoa…
        </Button>
      </div>

      <ConfirmDialog
        open={open}
        title="Baixar os dados desta pessoa?"
        confirmLabel="Baixar arquivo"
        busyLabel="Preparando…"
        busy={busy}
        onConfirm={confirm}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <div className={styles.dialogText}>
          <p>
            O arquivo tem dados pessoais, entre eles o e-mail. Guarde-o num lugar privado e envie só
            para o e-mail cadastrado da própria conta.
          </p>
          <p>Esta ação fica registrada na auditoria.</p>
        </div>
      </ConfirmDialog>
    </section>
  );
}
