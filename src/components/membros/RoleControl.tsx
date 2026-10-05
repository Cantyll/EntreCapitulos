'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';

import { changeMemberRole } from '@/app/painel/membros/actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { isNameConfirmed } from '@/lib/members/confirm';
import type { MemberErrorKey } from '@/lib/members/errors';

import styles from './members.module.css';
import { RoleBadge } from './RoleBadge';
import { ResultNotice } from './ResultNotice';

const ORDER: readonly Role[] = ['member', 'moderator', 'admin'];

/** O que muda para a pessoa, dito antes de confirmar. */
function consequence(target: Role, current: Role) {
  if (target === 'admin') {
    return `Com o cargo de ${ROLE_LABELS.admin}, a pessoa abre todo o painel e pode mudar cargos, suspender comentários e excluir contas.`;
  }
  if (target === 'moderator') {
    return current === 'admin'
      ? `A pessoa deixa de abrir livros, sessões e membros: passa a abrir só Comentários e Minha conta.`
      : `A pessoa passa a abrir só Comentários e Minha conta. Os comentários dela passam a ser publicados direto e o selo "${ROLE_LABELS.moderator}" aparece ao lado do nome.`;
  }
  return `A pessoa perde o acesso ao painel na próxima página ou ação e o selo "${ROLE_LABELS[current]}" some dos comentários dela. A conta e os comentários continuam.`;
}

type Props = {
  memberId: string;
  name: string;
  role: Role;
  /** `true`: não se dá cargo de equipe a quem está suspenso. `null`: não deu para saber (o banco confere). */
  suspended: boolean | null;
};

/** Alterar o cargo: escolha, diálogo de confirmação (com o nome digitado para dar Administração) e resultado. */
export function RoleControl({ memberId, name, role, suspended }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Role>(role);
  const [seenRole, setSeenRole] = useState<Role>(role);
  // Depois de uma mudança bem-sucedida a página traz o cargo novo: o seletor acompanha (sem `key`, que
  // remontaria o controle e apagaria o aviso).
  if (role !== seenRole) {
    setSeenRole(role);
    setSelected(role);
  }
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<{ message: string; code: MemberErrorKey } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const selectId = useId();
  const nameId = useId();

  const needsName = selected === 'admin';
  const blockedBySuspension = suspended === true;

  function close() {
    if (pending) return;
    setOpen(false);
    setTyped('');
    setError(null);
  }

  function confirm() {
    startTransition(async () => {
      const result = await changeMemberRole(memberId, selected, role, typed);
      if (result.ok) {
        setOpen(false);
        setTyped('');
        setError(null);
        setNotice(result);
      } else {
        setError({ message: result.message, code: result.code });
      }
    });
  }

  return (
    <section
      className={`${styles.card} ${styles.section}`}
      aria-labelledby="cargo-titulo"
      data-tour="member-role"
    >
      <h2 id="cargo-titulo">Cargo</h2>
      <p>
        Cargo atual: <RoleBadge role={role} />
      </p>
      <div className={styles.fieldRow}>
        <label htmlFor={selectId} className={styles.fieldLabel}>
          Novo cargo
          <select
            id={selectId}
            value={selected}
            onChange={(event) => setSelected(event.target.value as Role)}
          >
            {ORDER.map((option) => (
              <option
                key={option}
                value={option}
                disabled={blockedBySuspension && option !== 'member' && option !== role}
              >
                {ROLE_LABELS[option]}
                {option === role ? ' (atual)' : ''}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="soft"
          disabled={selected === role}
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
        >
          Alterar cargo…
        </Button>
      </div>
      {blockedBySuspension && (
        <p>
          Esta pessoa está com os comentários suspensos: reative-os antes de dar um cargo de equipe.
        </p>
      )}
      <ResultNotice result={notice} />

      <ConfirmDialog
        open={open}
        title={`Alterar o cargo de ${name}?`}
        confirmLabel="Alterar cargo"
        busyLabel="Alterando…"
        busy={pending}
        disabled={needsName && !isNameConfirmed(typed, name)}
        error={
          error && (
            <>
              {error.message}
              {error.code === 'role_conflict' && (
                <>
                  {' '}
                  <button
                    type="button"
                    className={styles.inlineButton}
                    onClick={() => {
                      close();
                      router.refresh();
                    }}
                  >
                    Atualizar a página
                  </button>
                </>
              )}
            </>
          )
        }
        onConfirm={confirm}
        onClose={close}
      >
        <div className={styles.dialogText}>
          <p>
            De <strong>{ROLE_LABELS[role]}</strong> para <strong>{ROLE_LABELS[selected]}</strong>.
          </p>
          <p>{consequence(selected, role)}</p>
          {needsName && (
            <label htmlFor={nameId} className={styles.dialogField}>
              Para confirmar, digite o nome da pessoa: <strong>{name}</strong>
              <input
                id={nameId}
                type="text"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </label>
          )}
        </div>
      </ConfirmDialog>
    </section>
  );
}
