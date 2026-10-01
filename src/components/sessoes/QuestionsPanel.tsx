'use client';

import { useState, useTransition } from 'react';

import {
  addQuestionAction,
  removeQuestionAction,
  reorderQuestionsAction,
  updateQuestionAction,
} from '@/app/painel/sessoes/actions';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { QuestionItem } from '@/lib/sessions/items';
import { QUESTION_TEXT_MAX } from '@/lib/sessions/validation';

import styles from './sessoes.module.css';

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Perguntas para a discussão. Mesmo modelo dos trechos: cada ação vai na hora, fora do autosave. */
export function QuestionsPanel({
  sessionId,
  initial,
}: {
  sessionId: string | null;
  initial: QuestionItem[];
}) {
  const [items, setItems] = useState(initial);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const disabled = sessionId === null || pending;

  const run = (work: () => Promise<void>) => {
    setError('');
    startTransition(async () => {
      try {
        await work();
      } catch {
        setError('Não foi possível salvar agora. Tente de novo em instantes.');
      }
    });
  };

  const add = () =>
    run(async () => {
      const result = await addQuestionAction(sessionId!, { text });
      if (!result.ok) return setError(result.message);
      setItems((list) => [...list, result.item]);
      setText('');
    });

  const save = () =>
    run(async () => {
      if (!editing) return;
      const result = await updateQuestionAction(editing.id, { text: editing.text });
      if (!result.ok) return setError(result.message);
      setItems((list) => list.map((q) => (q.id === result.item.id ? result.item : q)));
      setEditing(null);
    });

  const remove = (id: string) =>
    run(async () => {
      const result = await removeQuestionAction(id);
      if (!result.ok) return setError(result.message);
      setItems((list) => list.filter((q) => q.id !== id));
    });

  const reorder = (index: number, delta: -1 | 1) =>
    run(async () => {
      const next = move(items, index, index + delta);
      const result = await reorderQuestionsAction(
        sessionId!,
        next.map((q) => q.id),
      );
      if (!result.ok) return setError(result.message);
      setItems(result.items);
    });

  return (
    <section className={styles.card} aria-labelledby="perguntas-titulo">
      <h2 id="perguntas-titulo">Perguntas para a discussão</h2>
      <p className={styles.muted} style={{ marginBottom: 12 }}>
        Perguntas que abrem a conversa no fim da sessão. Cada alteração aqui é salva na hora.
      </p>

      {items.length > 0 && (
        <ul className={styles.listEdit}>
          {items.map((question, index) => (
            <li key={question.id}>
              {editing?.id === question.id ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className={styles.muted} htmlFor={`pergunta-${question.id}`}>
                    Pergunta
                  </label>
                  <textarea
                    id={`pergunta-${question.id}`}
                    className={styles.textarea}
                    maxLength={QUESTION_TEXT_MAX}
                    value={editing.text}
                    onChange={(event) => setEditing({ id: question.id, text: event.target.value })}
                  />
                  <div className={styles.rowActions} style={{ marginTop: 8 }}>
                    <Button size="sm" disabled={pending} onClick={save}>
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={pending}
                      onClick={() => setEditing(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.itemText}>{question.text}</div>
                  <div className={styles.itemTools}>
                    <button
                      type="button"
                      className={styles.itemTool}
                      aria-label="Subir"
                      disabled={disabled || index === 0}
                      onClick={() => reorder(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.itemTool}
                      aria-label="Descer"
                      disabled={disabled || index === items.length - 1}
                      onClick={() => reorder(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={styles.itemTool}
                      aria-label="Editar"
                      disabled={disabled}
                      onClick={() => setEditing({ id: question.id, text: question.text })}
                    >
                      <Icon name="edit" size="sm" />
                    </button>
                    <button
                      type="button"
                      className={styles.itemTool}
                      aria-label="Remover"
                      disabled={disabled}
                      onClick={() => remove(question.id)}
                    >
                      <Icon name="x" size="sm" />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className={styles.error} style={{ marginBottom: 10 }}>
          {error}
        </p>
      )}

      <div className={styles.addForm}>
        <label className={styles.muted} htmlFor="nova-pergunta">
          Nova pergunta
        </label>
        <textarea
          id="nova-pergunta"
          className={styles.textarea}
          maxLength={QUESTION_TEXT_MAX}
          placeholder="Escreva uma pergunta para o clube"
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
        />
        <div>
          <Button variant="soft" disabled={disabled || !text.trim()} onClick={add}>
            <Icon name="plus" size="sm" /> Adicionar
          </Button>
        </div>
      </div>
    </section>
  );
}
