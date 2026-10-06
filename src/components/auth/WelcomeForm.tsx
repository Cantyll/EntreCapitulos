'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useActionState } from 'react';

import { completeWelcome, type WelcomeState } from '@/app/(public)/boas-vindas/actions';
import { Button, ButtonLink } from '@/components/ui/Button';
import { legalConfig } from '@/content/legal-config';
import { DISPLAY_NAME_MAX } from '@/lib/auth/display-name';

import styles from './auth.module.css';

type WelcomeFormProps = {
  next: string;
  initialName: string;
  /** O nome público ainda não foi escolhido. */
  askName: boolean;
  /** A pessoa nunca aceitou os Termos (ou aceitou uma versão antiga). */
  askTerms: boolean;
};

export function WelcomeForm({ next, initialName, askName, askTerms }: WelcomeFormProps) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(completeWelcome, {
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
        {askName && (
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
        )}
        {askTerms && (
          // Nunca vem marcada. Declaração da pessoa: o site não verifica a idade.
          <div className={styles.check}>
            <input
              id="aceite"
              name="acceptTerms"
              type="checkbox"
              className={styles.checkInput}
              required
            />
            <label htmlFor="aceite" className={styles.checkLabel}>
              Declaro que tenho {legalConfig.minimumAge} anos ou mais e li os{' '}
              <Link href="/termos" target="_blank" rel="noopener noreferrer">
                Termos de Uso
              </Link>{' '}
              e a{' '}
              <Link href="/privacidade" target="_blank" rel="noopener noreferrer">
                Política de Privacidade
              </Link>
            </label>
          </div>
        )}
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
          {askName && askTerms
            ? 'Sem escolher um nome e aceitar os Termos, você consegue ler as sessões, mas não consegue comentar.'
            : askTerms
              ? 'Sem aceitar os Termos, você consegue ler as sessões, mas não consegue comentar.'
              : 'Sem escolher um nome, você consegue ler as sessões, mas não consegue comentar.'}
        </p>
      </form>
    </div>
  );
}
