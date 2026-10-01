'use client';

import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useEffect, useRef } from 'react';

import { canonicalizeBody, type BodyDoc } from '@/lib/session-body';

import { sessionExtensions } from './extensions';
import styles from './editor.module.css';
import { Toolbar } from './Toolbar';

/*
 * O editor do relato (Tiptap). Só roda no cliente: `immediatelyRender: false` evita o erro de
 * hidratação (o servidor não sabe renderizar o ProseMirror). O conteúdo vem do pai uma vez; depois
 * disso o pai troca o texto por fora (`editor.commands.setContent`) só quando o controlador do
 * autosave pede (restaurar, carregar a versão do servidor, descartar).
 */
export function RichTextEditor({
  initialContent,
  editable,
  nextDivider,
  onChange,
  onEditor,
}: {
  initialContent: BodyDoc;
  editable: boolean;
  nextDivider: number | null;
  onChange: (doc: BodyDoc) => void;
  onEditor: (editor: Editor | null) => void;
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: sessionExtensions,
    content: initialContent,
    editable,
    immediatelyRender: false,
    // Barra e contadores leem o estado por `useEditorState`; o editor em si não renderiza de novo.
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Relato da sessão',
        lang: 'pt-BR',
        autocapitalize: 'sentences',
        spellcheck: 'true',
      },
      // Deixa folga para o cursor não ficar escondido sob a barra ancorada ou o topo do painel.
      scrollMargin: { top: 90, bottom: 120, left: 0, right: 0 },
      scrollThreshold: { top: 90, bottom: 120, left: 0, right: 0 },
    },
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(canonicalizeBody(e.getJSON() as BodyDoc));
    },
  });

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className={styles.wrap}>
      {editor ? (
        <Toolbar editor={editor} nextDivider={nextDivider} disabled={!editable} />
      ) : (
        <div className={styles.toolbarSlot} aria-hidden="true" />
      )}
      <div className={styles.paper}>
        <EditorContent editor={editor} className={styles.content} />
      </div>
    </div>
  );
}
