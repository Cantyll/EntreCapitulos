'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useActionState, useId } from 'react';

import styles from '@/components/auth/auth.module.css';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { DISPLAY_NAME_MAX } from '@/lib/auth/display-name';

import { saveDisplayName, type DisplayNameState } from './actions';

export function DisplayNameForm({ suggestion, next }: { suggestion: string; next: Route }) {
  const [state, formAction, pending] = useActionState<DisplayNameState, FormData>(saveDisplayName, {
    error: null,
  });
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error && (
        <p id={errorId} className={styles.error} role="alert">
          <Icon name="x" size="sm" />
          {state.error}
        </p>
      )}
      <div className={styles.field}>
        <label htmlFor={inputId}>Seu nome no clube</label>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          name="display_name"
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX}
          required
          defaultValue={state.value ?? suggestion}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={[hintId, state.error ? errorId : null].filter(Boolean).join(' ')}
        />
        <small id={hintId} className={styles.hint}>
          Esse nome é público: aparece para qualquer pessoa ao lado dos seus comentários. Não use o
          seu e-mail.
        </small>
      </div>
      <Button type="submit" block disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar e continuar'}
      </Button>
      <Link href={next} className={styles.skip}>
        Agora não, só quero ler
      </Link>
    </form>
  );
}
