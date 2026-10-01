'use client';

import { useEditorState, type Editor } from '@tiptap/react';
import { useRef, useState, type FormEvent, type MouseEvent } from 'react';

import { Icon, type IconName } from '@/components/ui/Icon';
import { isSafeHref } from '@/lib/session-body';

import styles from './editor.module.css';
import { useKeyboardInset } from './useKeyboardInset';

/*
 * Barra de formatação. Em tela de toque com o teclado aberto ela fica ancorada logo acima dele
 * (`visualViewport`), e o espaço dela continua reservado no fluxo para a página não pular quando
 * ela sai do lugar. Em desktop é sticky, como no protótipo. Os botões não tiram o foco do texto
 * (`mousedown` cancelado), senão o teclado fecharia a cada toque.
 */

const keepFocus = (event: MouseEvent) => event.preventDefault();

function ToolButton({
  label,
  icon,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  icon: IconName;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: string;
}) {
  return (
    <button
      type="button"
      className={styles.tool}
      aria-label={children ? undefined : label}
      aria-pressed={active === undefined ? undefined : active}
      title={label}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      <Icon name={icon} size="sm" />
      {children}
    </button>
  );
}

/** "exemplo.com" vira "https://exemplo.com"; `mailto:`/`http(s):` seguem como estão. */
export function normalizeHref(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  return `https://${value}`;
}

export function Toolbar({
  editor,
  nextDivider,
  disabled,
}: {
  editor: Editor;
  /** Número da próxima divisória; `null` quando todos os capítulos da faixa já têm uma. */
  nextDivider: number | null;
  disabled: boolean;
}) {
  const inset = useKeyboardInset();
  const docked = inset > 0;
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const [linkError, setLinkError] = useState('');
  const linkInput = useRef<HTMLInputElement>(null);

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      heading: e.isActive('heading', { level: 2 }),
      quote: e.isActive('blockquote'),
      list: e.isActive('bulletList'),
      link: e.isActive('link'),
      hasSelection: !e.state.selection.empty,
    }),
  });

  const openLink = () => {
    const current = (editor.getAttributes('link').href as string | undefined) ?? '';
    setHref(current);
    setLinkError('');
    setLinkOpen(true);
    requestAnimationFrame(() => linkInput.current?.focus());
  };

  const closeLink = () => {
    setLinkOpen(false);
    editor.chain().focus().run();
  };

  const applyLink = (event: FormEvent) => {
    event.preventDefault();
    const value = normalizeHref(href);
    if (!value) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkOpen(false);
      return;
    }
    if (!isSafeHref(value)) {
      setLinkError('Use um link começando com http://, https:// ou mailto:.');
      return;
    }
    if (!active.link && !active.hasSelection) {
      setLinkError('Selecione no texto as palavras que viram o link.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
    setLinkOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
  };

  return (
    <div className={styles.toolbarSlot} data-docked={docked ? '' : undefined}>
      <div
        className={styles.toolbar}
        style={docked ? { bottom: inset } : undefined}
        role="toolbar"
        aria-label="Formatação"
      >
        <div className={styles.toolRow}>
          <ToolButton
            label="Negrito"
            icon="bold"
            active={active.bold}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolButton
            label="Itálico"
            icon="italic"
            active={active.italic}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <span className={styles.sep} aria-hidden="true" />
          <ToolButton
            label="Título"
            icon="heading"
            active={active.heading}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          />
          <ToolButton
            label="Citação"
            icon="quote"
            active={active.quote}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <ToolButton
            label="Lista"
            icon="ul"
            active={active.list}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <span className={styles.sep} aria-hidden="true" />
          <ToolButton
            label="Link"
            icon="link"
            active={active.link}
            disabled={disabled}
            onClick={openLink}
          />
          <span className={styles.sep} aria-hidden="true" />
          <ToolButton
            label={
              nextDivider === null
                ? 'Todos os capítulos da faixa já têm divisória'
                : `Divisória do capítulo ${nextDivider}`
            }
            icon="divider"
            disabled={disabled || nextDivider === null}
            onClick={() => {
              if (nextDivider === null) return;
              editor
                .chain()
                .focus()
                .insertContent({ type: 'chapterDivider', attrs: { chapter: nextDivider } })
                .run();
            }}
          >
            Divisória de capítulo
          </ToolButton>
        </div>

        {linkOpen && (
          <form className={styles.linkRow} onSubmit={applyLink}>
            <label className={styles.linkLabel}>
              <span>Link</span>
              <input
                ref={linkInput}
                className={styles.linkInput}
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://…"
                value={href}
                onChange={(event) => {
                  setHref(event.target.value);
                  setLinkError('');
                }}
              />
            </label>
            <button type="submit" className={styles.linkBtn}>
              Aplicar
            </button>
            {active.link && (
              <button type="button" className={styles.linkBtn} onClick={removeLink}>
                Remover
              </button>
            )}
            <button type="button" className={styles.linkBtn} onClick={closeLink}>
              Cancelar
            </button>
            {linkError && (
              <p role="alert" className={styles.linkError}>
                {linkError}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
