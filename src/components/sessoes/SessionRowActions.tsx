'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { deleteDraftAction, unpublishSessionAction } from '@/app/painel/sessoes/actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { IconButton, IconLink } from '@/components/ui/IconButton';
import { adminSessionHref, sessionHref } from '@/lib/routes';
import type { SessionListItem } from '@/lib/sessions/queries';

import styles from './sessoes.module.css';

type Dialog = null | 'unpublish' | 'delete';

/** Ações de uma linha da lista: editar, ver no site, voltar para rascunho e excluir rascunho. */
export function SessionRowActions({ session }: { session: SessionListItem }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const published = session.status === 'published';

  const close = () => {
    if (busy) return;
    setDialog(null);
    setError(null);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result =
        dialog === 'unpublish'
          ? await unpublishSessionAction(session.id)
          : await deleteDraftAction(session.id);
      if (!result.ok) return setError(result.message);
      setDialog(null);
      router.refresh();
    } catch {
      setError('Sem conexão: não foi possível agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.rowActions}>
      {published && (
        <IconLink
          href={sessionHref(session.bookSlug, session.number)}
          label={`Ver a sessão ${session.number} no site`}
          size="sm"
        >
          <Icon name="eye" size="sm" />
        </IconLink>
      )}
      <IconLink
        href={adminSessionHref(session.id)}
        label={`Editar a sessão ${session.number}`}
        size="sm"
      >
        <Icon name="edit" size="sm" />
      </IconLink>
      {published && session.liveCommentCount === 0 && (
        <Button variant="ghost" size="sm" onClick={() => setDialog('unpublish')}>
          Voltar para rascunho
        </Button>
      )}
      {!published && (
        <IconButton
          label={`Excluir o rascunho da sessão ${session.number}`}
          size="sm"
          onClick={() => setDialog('delete')}
        >
          <Icon name="trash" size="sm" />
        </IconButton>
      )}

      <ConfirmDialog
        open={dialog === 'unpublish'}
        title={`Voltar a sessão ${session.number} para rascunho?`}
        confirmLabel="Voltar para rascunho"
        busyLabel="Voltando…"
        busy={busy}
        error={error}
        onConfirm={() => void confirm()}
        onClose={close}
      >
        <p>A sessão sai do site, mas o texto continua salvo.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Excluir este rascunho?"
        confirmLabel="Excluir de vez"
        busyLabel="Excluindo…"
        busy={busy}
        danger
        error={error}
        onConfirm={() => void confirm()}
        onClose={close}
      >
        <p>
          “{session.title}” será apagado, junto com os trechos e as perguntas. Não dá para desfazer.
        </p>
      </ConfirmDialog>
    </div>
  );
}
