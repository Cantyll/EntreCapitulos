'use client';

import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useEffect, useRef } from 'react';

import { Toolbar } from '@/components/sessoes/editor/Toolbar';
import { canonicalizeRichDoc, type RichDoc } from '@/lib/about';

import styles from './aboutEditor.module.css';
import { aboutExtensions } from './extensions';

/*
 * Campo de texto rico da página Sobre (abertura e seções extras). Tiptap, só no cliente (`immediatelyRender: false`).
 * O texto inicial entra UMA vez; para trocá-lo por fora (carregar a versão do servidor, restaurar) o pai remonta o
 * campo com outra `key`. A barra é a compacta do editor de sessões (negrito, itálico, lista e link) e só a do campo
 * com foco sobe acima do teclado do iPhone: há vários campos na página.
 */
export function RichTextField({
  id,
  label,
  placeholder,
  initial,
  onChange,
  error,
  hint,
  disabled,
  dataTour,
}: {
  id: string;
  label: string;
  placeholder: string;
  initial: RichDoc;
  onChange: (doc: RichDoc) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  dataTour?: string;
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: aboutExtensions,
    content: initial,
    editable: !disabled,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': `${id}-rotulo`,
        ...(hint || error
          ? {
              'aria-describedby': [hint ? `${id}-hint` : '', error ? `${id}-erro` : '']
                .filter(Boolean)
                .join(' '),
            }
          : {}),
        'data-placeholder': placeholder,
        lang: 'pt-BR',
        autocapitalize: 'sentences',
        spellcheck: 'true',
      },
      scrollMargin: { top: 90, bottom: 120, left: 0, right: 0 },
      scrollThreshold: { top: 90, bottom: 120, left: 0, right: 0 },
    },
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(canonicalizeRichDoc(e.getJSON() as RichDoc));
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  const characters = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? Array.from(e.getText()).length : 0),
  });

  return (
    <div className={styles.field} data-tour={dataTour}>
      <div className={styles.labelRow}>
        <span id={`${id}-rotulo`} className={styles.label}>
          {label}
        </span>
        <span className={styles.counter} aria-hidden="true">
          {characters ?? 0} caracteres
        </span>
      </div>
      {editor ? (
        <Toolbar
          editor={editor}
          nextDivider={null}
          disabled={Boolean(disabled)}
          variant="compact"
          label={`Formatação: ${label}`}
          dockWhenFocused
        />
      ) : null}
      <div className={`${styles.paper} ${error ? styles.paperInvalid : ''}`}>
        <EditorContent editor={editor} className={styles.content} />
      </div>
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-erro`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
