'use client';

import type { Route } from 'next';
import { useActionState } from 'react';

import { saveDisplayName, type WelcomeState } from '@/app/(public)/boas-vindas/actions';
import { Button, ButtonLink } from '@/components/ui/Button';
import { DISPLAY_NAME_MAX } from '@/lib/auth/display-name';

import styles from './auth.module.css';

type WelcomeFormProps = { next: string; initialName: string };

export function WelcomeForm({ next, initialName }: WelcomeFormProps) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(saveDisplayName, {
    error: null,
    value: initialName,
  });

  return (
    <div className={styles.card}>
      <form action={action} className={styles.stack}>
        <input type="hidden" name="next" value={next} />
        {state.error && (
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
        )}
        <div className={styles.field}>
          <label htmlFor="nome">Como devemos chamar você nos comentários?</label>
          <input
            id="nome"
            name="displayName"
            className={styles.input}
            type="text"
            autoComplete="nickname"
            maxLength={DISPLAY_NAME_MAX}
            defaultValue={state.value}
            aria-describedby="nome-dica"
            required
          />
          <p id="nome-dica" className={styles.hint}>
            Esse nome é público: aparece para qualquer visitante, junto dos seus comentários. Não
            use seu e-mail.
          </p>
        </div>
        <Button type="submit" block disabled={pending}>
          {pending ? 'Salvando…' : 'Continuar'}
        </Button>
        <div className={styles.row}>
          {/* `next` já vem validado pelo servidor (safeNext). */}
          <ButtonLink href={next as Route} variant="ghost" size="sm">
            Agora não, só quero ler
          </ButtonLink>
        </div>
        <p className={styles.note}>
          Sem escolher um nome, você consegue ler as sessões, mas não consegue comentar.
        </p>
      </form>
    </div>
  );
}
