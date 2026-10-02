'use client';

import { startTransition, useActionState, useState, type FormEvent } from 'react';

import { saveAccountName, type AccountNameState } from '@/app/(public)/conta/actions';
import { Button } from '@/components/ui/Button';
import { DISPLAY_NAME_MAX } from '@/lib/auth/display-name';

import styles from './conta.module.css';

/**
 * Nome público. Envia no `onSubmit` (e não em `action={…}`): o React 19 zera os campos de um formulário
 * quando a action termina, e o nome precisa continuar na tela, com ou sem erro.
 */
export function NameForm({ initialName }: { initialName: string }) {
  const [state, action, pending] = useActionState<AccountNameState, FormData>(saveAccountName, {
    status: 'idle',
    message: '',
    value: initialName,
  });
  const [name, setName] = useState(initialName);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={onSubmit} className={styles.card} aria-labelledby="conta-nome-titulo">
      <h2 id="conta-nome-titulo">Seu nome</h2>
      <div className={styles.field}>
        <label htmlFor="conta-nome">Nome que aparece nos seus comentários</label>
        <input
          id="conta-nome"
          name="displayName"
          className={styles.input}
          type="text"
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-describedby="conta-nome-dica"
          required
        />
        <p id="conta-nome-dica" className={styles.hint}>
          Esse nome é público: aparece para qualquer visitante, junto dos seus comentários. Não use
          seu e-mail. Nos comentários já publicados, o nome novo pode levar alguns minutos para
          aparecer.
        </p>
      </div>
      {state.status === 'error' && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}
      {state.status === 'ok' && (
        <p role="status" className={styles.ok}>
          {state.message}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar nome'}
        </Button>
      </div>
    </form>
  );
}
