'use client';

import { useState, useTransition } from 'react';

import {
  addNoteAction,
  removeNoteAction,
  reorderNotesAction,
  updateNoteAction,
} from '@/app/painel/sessoes/actions';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { NoteItem } from '@/lib/sessions/items';
import { NOTE_REFERENCE_MAX, NOTE_TEXT_MAX } from '@/lib/sessions/validation';

import styles from './sessoes.module.css';

type Draft = { kind: 'quote' | 'note'; text: string; reference: string };
const EMPTY: Draft = { kind: 'quote', text: '', reference: '' };

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * Trechos do livro e anotações da Agatha. Cada adição, edição, remoção e reordenação é uma Server
 * Action própria e vai na hora: não passa pelo autosave do texto. Só funciona depois que a sessão
 * existe no banco.
 */
export function NotesPanel({
  sessionId,
  initial,
}: {
  sessionId: string | null;
  initial: NoteItem[];
}) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
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
      const result = await addNoteAction(sessionId!, draft);
      if (!result.ok) return setError(result.message);
      setItems((list) => [...list, result.item]);
      setDraft((d) => ({ ...EMPTY, kind: d.kind }));
    });

  const save = () =>
    run(async () => {
      if (!editing) return;
      const result = await updateNoteAction(editing.id, editing.draft);
      if (!result.ok) return setError(result.message);
      setItems((list) => list.map((n) => (n.id === result.item.id ? result.item : n)));
      setEditing(null);
    });

  const remove = (id: string) =>
    run(async () => {
      const result = await removeNoteAction(id);
      if (!result.ok) return setError(result.message);
      setItems((list) => list.filter((n) => n.id !== id));
    });

  const reorder = (index: number, delta: -1 | 1) =>
    run(async () => {
      const next = move(items, index, index + delta);
      const result = await reorderNotesAction(
        sessionId!,
        next.map((n) => n.id),
      );
      if (!result.ok) return setError(result.message);
      setItems(result.items);
    });

  const form = (value: Draft, set: (d: Draft) => void, idPrefix: string) => (
    <div className={styles.addForm}>
      <div className={styles.formRow}>
        <div>
          <label className={styles.muted} htmlFor={`${idPrefix}-tipo`}>
            Tipo
          </label>
          <select
            id={`${idPrefix}-tipo`}
            className={styles.select}
            value={value.kind}
            disabled={disabled}
            onChange={(event) => set({ ...value, kind: event.target.value as Draft['kind'] })}
          >
            <option value="quote">Trecho do livro</option>
            <option value="note">Anotação minha</option>
          </select>
        </div>
        <div>
          <label className={styles.muted} htmlFor={`${idPrefix}-ref`}>
            Capítulo e página
          </label>
          <input
            id={`${idPrefix}-ref`}
            className={styles.input}
            type="text"
            maxLength={NOTE_REFERENCE_MAX}
            placeholder="Ex.: Capítulo 10, página 162"
            value={value.reference}
            disabled={disabled}
            onChange={(event) => set({ ...value, reference: event.target.value })}
          />
        </div>
      </div>
      <div>
        <label className={styles.muted} htmlFor={`${idPrefix}-texto`}>
          {value.kind === 'quote' ? 'Trecho' : 'Anotação'}
        </label>
        <textarea
          id={`${idPrefix}-texto`}
          className={styles.textarea}
          maxLength={NOTE_TEXT_MAX}
          placeholder={
            value.kind === 'quote' ? 'Cole um trecho curto e real do livro' : 'Escreva sua anotação'
          }
          value={value.text}
          disabled={disabled}
          onChange={(event) => set({ ...value, text: event.target.value })}
        />
      </div>
    </div>
  );

  return (
    <section className={styles.card} aria-labelledby="trechos-titulo">
      <h2 id="trechos-titulo">Trechos e anotações</h2>
      <p className={styles.muted} style={{ marginBottom: 12 }}>
        Trechos são citações curtas e reais do livro, com capítulo e página. Anotações são suas.
        Cada alteração aqui é salva na hora.
      </p>

      {sessionId === null && (
        <p className={styles.muted} style={{ marginBottom: 12 }}>
          Escreva o título ou o texto: depois que o rascunho for salvo, dá para adicionar trechos.
        </p>
      )}

      {items.length > 0 && (
        <ul className={styles.listEdit}>
          {items.map((note, index) => (
            <li key={note.id}>
              {editing?.id === note.id ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  {form(
                    editing.draft,
                    (d) => setEditing({ id: note.id, draft: d }),
                    `ed-${note.id}`,
                  )}
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
                  <div className={note.kind === 'quote' ? styles.itemQuote : styles.itemText}>
                    <span className={styles.itemKind}>
                      {note.kind === 'quote' ? 'Trecho' : 'Anotação'}
                    </span>
                    {note.kind === 'quote' ? `“${note.text}”` : note.text}
                    {note.reference && <small className={styles.itemRef}>{note.reference}</small>}
                  </div>
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
                      onClick={() =>
                        setEditing({
                          id: note.id,
                          draft: { kind: note.kind, text: note.text, reference: note.reference },
                        })
                      }
                    >
                      <Icon name="edit" size="sm" />
                    </button>
                    <button
                      type="button"
                      className={styles.itemTool}
                      aria-label="Remover"
                      disabled={disabled}
                      onClick={() => remove(note.id)}
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

      {form(draft, setDraft, 'novo-trecho')}
      <div style={{ marginTop: 10 }}>
        <Button variant="soft" disabled={disabled || !draft.text.trim()} onClick={add}>
          <Icon name="plus" size="sm" /> Adicionar
        </Button>
      </div>
    </section>
  );
}
