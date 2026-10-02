'use client';

import { startTransition, useActionState, useState, type FormEvent } from 'react';

import { deleteAccount, type DeleteAccountState } from '@/app/(public)/conta/actions';
import { Button } from '@/components/ui/Button';
import { DELETE_CONFIRMATION, isDeleteConfirmed } from '@/lib/account/messages';

import styles from './conta.module.css';

/** Exclusão da conta com confirmação digitada. A mesma conferência acontece no servidor. */
export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteAccount, {
    error: null,
  });
  const [typed, setTyped] = useState('');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={onSubmit} className={styles.stack} style={{ gap: 14, margin: 0 }}>
      <div className={styles.field}>
        <label htmlFor="conta-excluir">
          Para confirmar, digite <b>{DELETE_CONFIRMATION}</b>
        </label>
        <input
          id="conta-excluir"
          name="confirmation"
          className={styles.input}
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          type="submit"
          variant="ghost"
          danger
          disabled={pending || !isDeleteConfirmed(typed)}
        >
          {pending ? 'Excluindo…' : 'Excluir minha conta para sempre'}
        </Button>
      </div>
    </form>
  );
}
