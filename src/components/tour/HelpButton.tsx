'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { cx } from '@/lib/cx';
import { chaptersFor } from '@/lib/tour';

import { useHelpButtonRef, useTour } from './TourProvider';
import styles from './tour.module.css';

/*
 * O botão "?" do painel (etapa 8k): na barra superior, à ESQUERDA do sino, em toda página do painel, para a
 * administração e para a moderação. Abre um menu (popover abaixo e à direita no computador; folha inferior no
 * celular e no iPad em retrato): "Ajuda desta tela", "Tour completo", "Escolher um capítulo" e, quando há passos
 * novos, "Novidades". Fecha com Esc, toque fora ou Fechar, e o foco volta ao "?".
 *
 * A dica de uma vez só ("Você pode rever o tutorial aqui quando quiser") fica ancorada nele, sem fechar sozinha.
 */
export function HelpButton() {
  const tour = useTour();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hintButtonRef = useRef<HTMLButtonElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const hintId = useId();
  const [view, setView] = useState<'main' | 'chapters'>('main');
  const menuOpen = tour?.menuOpen ?? false;
  const hint = tour?.hint ?? null;
  const buttonRef = useHelpButtonRef();

  // O menu acompanha o estado do provedor (o atalho "?" e o item "Tutorial" de "Mais" também o abrem).
  useEffect(() => {
    const dialog = dialogRef.current;
    const button = buttonRef?.current ?? null;
    if (!dialog) return;
    if (menuOpen && !dialog.open) {
      if (button) {
        const box = button.getBoundingClientRect();
        dialog.style.setProperty('--menu-top', `${Math.round(box.bottom + 8)}px`);
        dialog.style.setProperty(
          '--menu-right',
          `${Math.max(16, Math.round(window.innerWidth - box.right))}px`,
        );
      }
      dialog.showModal();
    } else if (!menuOpen && dialog.open) {
      dialog.close();
    }
  }, [menuOpen, buttonRef]);

  // A dica que nasce de um gesto da pessoa ("Agora não", fim do tour) recebe o foco; a de novidades, não. Ela fica
  // ancorada ao "?" pela direita; numa tela estreita (320px) isso a faria sair pela esquerda, então ela desliza para a
  // direita só o necessário para caber entre as margens de 16px.
  useEffect(() => {
    const button = buttonRef?.current ?? null;
    const box = hintRef.current;
    if (hint && button && box) {
      const anchor = button.getBoundingClientRect().right;
      const width = box.getBoundingClientRect().width;
      const right = Math.min(Math.max(anchor, 16 + width), window.innerWidth - 16);
      box.style.setProperty('--hint-shift', `${Math.round(anchor - right)}px`);
    }
    if (hint === 'review') hintButtonRef.current?.focus();
  }, [hint, buttonRef]);

  if (!tour) return null;

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) tour?.setMenuOpen(false);
  }

  const chapters = chaptersFor(tour.role);
  const opener = () => buttonRef?.current ?? null;

  return (
    <div className={styles.help}>
      <IconButton
        ref={buttonRef ?? undefined}
        label="Ajuda e tutorial"
        title="Ajuda e tutorial"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        className={cx(hint && styles.pulse)}
        data-tour="help-button"
        onClick={() => tour.setMenuOpen(!menuOpen)}
      >
        <Icon name="help" />
      </IconButton>

      {hint && (
        <div
          ref={hintRef}
          className={styles.hint}
          role="dialog"
          aria-modal="false"
          aria-labelledby={hintId}
          data-tour-hint={hint}
        >
          <p id={hintId}>
            {hint === 'review'
              ? 'Você pode rever o tutorial aqui quando quiser.'
              : 'Há novidades no tutorial.'}
          </p>
          <div className={styles.hintActions}>
            {hint === 'news' && (
              <Button variant="ghost" size="sm" onClick={() => tour.answerHint('ok')}>
                Agora não
              </Button>
            )}
            <Button
              ref={hintButtonRef}
              size="sm"
              onClick={() => tour.answerHint(hint === 'news' ? 'news' : 'ok')}
            >
              {hint === 'news' ? 'Ver novidades' : 'Entendi'}
            </Button>
          </div>
        </div>
      )}

      <dialog
        ref={dialogRef}
        className={styles.menu}
        aria-labelledby={titleId}
        onClick={closeOnBackdrop}
        onClose={() => {
          tour.setMenuOpen(false);
          setView('main');
        }}
        data-tour-menu=""
      >
        <div className={styles.menuBody}>
          <div className={styles.menuHead}>
            <h2 id={titleId}>{view === 'main' ? 'Ajuda' : 'Escolher um capítulo'}</h2>
            <IconButton label="Fechar" size="sm" onClick={() => tour.setMenuOpen(false)}>
              <Icon name="x" size="sm" />
            </IconButton>
          </div>
          {view === 'main' ? (
            <ul className={styles.menuList}>
              <li>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => tour.start({ mode: 'screen', pathname }, opener())}
                >
                  Ajuda desta tela
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => tour.start({ mode: 'full' }, opener())}
                >
                  Tour completo
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => setView('chapters')}
                >
                  Escolher um capítulo
                  <Icon name="right" size="sm" />
                </button>
              </li>
              {tour.newsAvailable && tour.seen !== null && (
                <li>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => tour.start({ mode: 'news', seen: tour.seen ?? 0 }, opener())}
                  >
                    Novidades
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <>
              <ol className={styles.menuList}>
                {chapters.map((chapter) => (
                  <li key={chapter.id}>
                    <button
                      type="button"
                      className={styles.menuItem}
                      onClick={() => tour.start({ mode: 'chapter', chapter: chapter.id }, opener())}
                    >
                      {chapter.number}. {chapter.title}
                    </button>
                  </li>
                ))}
              </ol>
              <button type="button" className={styles.menuBack} onClick={() => setView('main')}>
                <Icon name="left" size="sm" />
                Voltar
              </button>
            </>
          )}
          <p className={styles.shortcut}>Atalho: ?</p>
        </div>
      </dialog>
    </div>
  );
}
