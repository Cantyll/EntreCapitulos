'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { adminMemberHref } from '@/lib/routes';

import styles from './members.module.css';

/**
 * Baixar os dados da pessoa. O arquivo vem de um POST (um `<form>` comum, sem JavaScript no meio): quem confirma
 * no diálogo envia o formulário, e o navegador baixa o anexo sem sair da página. Se o servidor não puder gerar o
 * arquivo, ele volta para este perfil com um aviso. A ação fica registrada na auditoria.
 *
 * O download de um anexo não avisa quando começa, e a página não sai do lugar. Por isso o diálogo fecha pouco
 * depois do envio e a lista de auditoria é refeita duas vezes (a linha entra antes de o arquivo sair; a segunda
 * leitura cobre uma resposta lenta). Enquanto isso o botão que abre o diálogo fica desabilitado, para um segundo
 * clique não gerar outro arquivo (e outra linha na auditoria) sem querer.
 */
const CLOSE_AFTER_MS = 1200;
const COOLDOWN_MS = 5000;

export function ExportControl({ memberId }: { memberId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const timers = useRef<number[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooling, setCooling] = useState(false);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  function confirm() {
    setBusy(true);
    setCooling(true);
    formRef.current?.requestSubmit();
    timers.current.push(
      window.setTimeout(() => {
        setBusy(false);
        setOpen(false);
        router.refresh();
      }, CLOSE_AFTER_MS),
      window.setTimeout(() => {
        setCooling(false);
        router.refresh();
      }, COOLDOWN_MS),
    );
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
        <Button variant="soft" disabled={cooling} onClick={() => setOpen(true)}>
          {cooling ? 'Preparando o arquivo…' : 'Baixar dados da pessoa…'}
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
