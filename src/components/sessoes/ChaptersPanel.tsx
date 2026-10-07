'use client';

import type { Editor } from '@tiptap/react';

import { Button } from '@/components/ui/Button';
import { checkDividers, DIVIDER_TITLE_MAX, type BodyDoc } from '@/lib/session-body';

import styles from './sessoes.module.css';

type DividerInfo = { pos: number; size: number; chapter: number; title: string };

/** Divisórias de capítulo do texto, com a posição de cada uma no documento do editor. */
function dividersIn(editor: Editor): DividerInfo[] {
  const found: DividerInfo[] = [];
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name !== 'chapterDivider') return;
    found.push({
      pos: offset,
      size: node.nodeSize,
      chapter: Number(node.attrs.chapter),
      title: typeof node.attrs.title === 'string' ? node.attrs.title : '',
    });
  });
  return found;
}

/**
 * "Capítulos desta sessão": o título de cada divisória se edita aqui, num campo comum (16px no
 * celular), e não dentro do editor. Mexer no campo muda o atributo do nó por comando do editor, sem
 * tirar o foco de onde a pessoa estava. Também lista os avisos das regras de divisória.
 */
export function ChaptersPanel({
  editor,
  body,
  from,
  to,
  strict,
  disabled,
}: {
  editor: Editor | null;
  body: BodyDoc;
  from: number;
  to: number;
  /** Sessão no ar: ordem e faixa fora de regra bloqueiam o salvamento (aparecem em vermelho). */
  strict: boolean;
  disabled: boolean;
}) {
  const dividers = editor ? dividersIn(editor) : [];
  const { blocking, warnings } = checkDividers(body, from, to);

  const setTitle = (pos: number, title: string) => {
    editor
      ?.chain()
      .command(({ tr, state }) => {
        const node = state.doc.nodeAt(pos);
        if (!node || node.type.name !== 'chapterDivider') return false;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, title: title || null });
        return true;
      })
      .run();
  };

  const remove = (info: DividerInfo) => {
    editor
      ?.chain()
      .command(({ tr }) => {
        tr.delete(info.pos, info.pos + info.size);
        return true;
      })
      .run();
  };

  return (
    <section className={styles.card} aria-labelledby="capitulos-titulo" data-tour="editor-chapters">
      <h2 id="capitulos-titulo">Capítulos desta sessão</h2>
      <p className={styles.muted} style={{ marginBottom: 10 }}>
        Cada divisória começa um capítulo no relato. É por elas que o filtro de spoiler esconde ou
        mostra o texto.
      </p>

      {dividers.length === 0 ? (
        <p className={styles.muted}>
          Nenhuma divisória ainda. Use “Divisória de capítulo” na barra do editor.
        </p>
      ) : (
        <div className={styles.stack}>
          {dividers.map((divider, index) => (
            <div key={`${divider.pos}-${index}`} className={styles.dividerItem}>
              <label htmlFor={`titulo-capitulo-${index}`}>
                Título do capítulo {divider.chapter}
              </label>
              <div className={styles.dividerRow}>
                <input
                  id={`titulo-capitulo-${index}`}
                  className={styles.input}
                  type="text"
                  maxLength={DIVIDER_TITLE_MAX}
                  value={divider.title}
                  disabled={disabled}
                  placeholder="Opcional"
                  onChange={(event) => setTitle(divider.pos, event.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  danger
                  disabled={disabled}
                  aria-label={`Remover a divisória do capítulo ${divider.chapter}`}
                  onClick={() => remove(divider)}
                >
                  Remover
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(blocking.length > 0 || warnings.length > 0) && (
        <ul className={styles.warnList} style={{ marginTop: 12 }} aria-label="Avisos">
          {blocking.map((issue, i) => (
            <li key={`b${i}`} data-blocking={strict ? '' : undefined}>
              {issue.message}
              {!strict && ' Ao publicar, isto precisa estar certo.'}
            </li>
          ))}
          {warnings.map((issue) => (
            <li key={`w${issue.chapter}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
