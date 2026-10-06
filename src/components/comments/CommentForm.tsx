'use client';

import Link from 'next/link';
import { useActionState, useEffect, useId, useState, startTransition } from 'react';

import { createComment } from '@/app/(public)/comment-actions';
import { Button } from '@/components/ui/Button';
import { COMMENT_MAX_LENGTH, commentLength } from '@/lib/comments';
import { IDLE_COMMENT_STATE, type CommentActionState } from '@/lib/comments/action-state';

import styles from './comments.module.css';

type Props = {
  sessionId: string;
  /** Comentário de nível superior ao qual esta resposta se dirige. */
  parentId?: string;
  /** Capítulos que o aviso de spoiler oferece (de `chapter_to + 1` até o total). Vazio: sem o seletor. */
  spoilerChoices: readonly number[];
  chapterTo: number;
  /** Para onde /boas-vindas volta depois de escolher o nome ou aceitar os Termos (a própria sessão). */
  welcomeHref: string;
  placeholder: string;
  label: string;
  submitLabel: string;
  autoFocus?: boolean;
  /** Chamado depois que o servidor aceita o comentário (com a mensagem dele). */
  onPosted?: (message: string) => void;
  onCancel?: () => void;
};

/*
 * Formulário de comentário e de resposta. O React 19 ZERA os campos de um `<form action>` quando a
 * action termina, mesmo com erro; aqui os campos são controlados e o envio é feito no `onSubmit`, então o
 * texto só é apagado quando o servidor aceita.
 */
export function CommentForm({
  sessionId,
  parentId,
  spoilerChoices,
  chapterTo,
  welcomeHref,
  placeholder,
  label,
  submitLabel,
  autoFocus,
  onPosted,
  onCancel,
}: Props) {
  const [state, submit, pending] = useActionState<CommentActionState, FormData>(
    createComment,
    IDLE_COMMENT_STATE,
  );
  const [body, setBody] = useState('');
  const [spoiler, setSpoiler] = useState('');
  const [seen, setSeen] = useState(state);
  const textId = useId();
  const counterId = useId();
  const spoilerId = useId();

  // Ajuste de estado na renderização (padrão do React): só limpa quando a resposta nova é um sucesso.
  if (state !== seen) {
    setSeen(state);
    if (state.status === 'ok') {
      setBody('');
      setSpoiler('');
    }
  }

  useEffect(() => {
    if (state.status === 'ok') onPosted?.(state.message);
  }, [state, onPosted]);

  const length = commentLength(body);
  const over = length > COMMENT_MAX_LENGTH;

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => submit(data));
      }}
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}

      <label htmlFor={textId} className={styles.srOnly}>
        {label}
      </label>
      <textarea
        id={textId}
        name="body"
        className={styles.textarea}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        rows={parentId ? 3 : 4}
        autoFocus={autoFocus}
        aria-describedby={counterId}
        aria-invalid={over || undefined}
        readOnly={pending}
      />

      <div className={styles.formFoot}>
        {spoilerChoices.length > 0 ? (
          <label htmlFor={spoilerId} className={styles.spoilerPick}>
            <span>Fala de algo depois do capítulo {chapterTo}?</span>
            <select
              id={spoilerId}
              name="spoilerUpTo"
              value={spoiler}
              onChange={(event) => setSpoiler(event.target.value)}
              disabled={pending}
            >
              <option value="">Não</option>
              {spoilerChoices.map((chapter) => (
                <option key={chapter} value={chapter}>
                  Sim, até o {chapter}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span />
        )}

        <div className={styles.formActions}>
          <span id={counterId} className={over ? styles.counterOver : styles.counter}>
            {length}/{COMMENT_MAX_LENGTH}
          </span>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
              Cancelar
            </Button>
          )}
          <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined}>
            {pending ? 'Enviando…' : submitLabel}
          </Button>
        </div>
      </div>

      {state.status === 'error' && (
        <p role="alert" className={styles.formError}>
          {state.message}
        </p>
      )}
      {state.status === 'error' && state.code === 'comments_suspended' && (
        <Link className={styles.formLink} href="/privacidade#quem-controla">
          Ver o e-mail de contato
        </Link>
      )}
      {state.status === 'error' && state.code === 'profile_incomplete' && (
        <Link className={styles.formLink} href={welcomeHref as never}>
          Escolher meu nome
        </Link>
      )}
      {state.status === 'error' && state.code === 'terms_not_accepted' && (
        <Link className={styles.formLink} href={welcomeHref as never}>
          Aceitar os Termos
        </Link>
      )}
      {state.status === 'ok' && !onPosted && (
        <p role="status" className={styles.formOk}>
          {state.message}
        </p>
      )}
    </form>
  );
}
