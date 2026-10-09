'use client';

import { animate } from 'motion/mini';
import type { Route } from 'next';
import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';

import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import {
  swipeIntent,
  turnFrames,
  turnTarget,
  type TurnAxis,
  type TurnDirection,
} from '@/lib/home/leaf';

import styles from './SessionLeaf.module.css';

export type LeafPage = {
  id: string;
  number: number;
  title: string;
  chapterFrom: number;
  chapterTo: number;
  /** Data já formatada pelo servidor ("27 de setembro"). */
  date: string | null;
  excerpt: string | null;
  href: Route;
  membersOnly: boolean;
};

type Turn = { index: number; direction: TurnDirection; axis: TurnAxis; reduced: boolean };

/** Duas páginas lado a lado acima desta largura (a mesma do `home.module.css`). */
const SPREAD_MEDIA = '(min-width: 861px)';
const REDUCED_MEDIA = '(prefers-reduced-motion: reduce)';

/**
 * A página da direita do livro aberto da home: a sessão mais recente, impressa como página, e as anteriores a um
 * gesto. Folhear (pelos botões ou arrastando para o lado) vira uma folha de verdade, animada com o Motion (Web
 * Animations API): a folha gira em torno do miolo no computador e em torno da borda de cima no celular. Com menos
 * movimento, ela só esmaece. O estado final mora no React, não na animação: se a animação não rodar, a página certa
 * aparece do mesmo jeito.
 */
export function SessionLeaf({ pages, aboutHref }: { pages: LeafPage[]; aboutHref: Route }) {
  // `shown` é a página de baixo; `turn` é a folha em movimento por cima dela.
  const [shown, setShown] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const leafRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLSpanElement>(null);
  const castRef = useRef<HTMLSpanElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const byButton = useRef(false);

  useLayoutEffect(() => {
    if (!turn) return;
    const leaf = leafRef.current;
    const shade = shadeRef.current;
    const cast = castRef.current;
    if (!leaf || !shade || !cast) return;
    const frames = turnFrames(turn.direction, turn.reduced, turn.axis);
    const [x1, y1, x2, y2] = frames.ease;
    const options = { duration: frames.duration / 1000, ease: [x1, y1, x2, y2] as const };
    const target = turn.index;
    const landing = turn.direction === 'older';
    const animations = [
      animate(leaf, frames.leaf, options),
      animate(shade, frames.shade, options),
      animate(cast, frames.cast, options),
    ];
    // Desmontar (ou o efeito rodar de novo no modo estrito) só para a animação: quem termina a virada é ela.
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      // Voltar: a folha nova pousou por cima; só agora ela vira a página de baixo.
      if (landing) setShown(target);
      setTurn(null);
    };
    Promise.all(animations.map((a) => a.finished)).then(finish, finish);
    return () => {
      cancelled = true;
      for (const a of animations) a.stop();
    };
  }, [turn]);

  // Depois de folhear pelo botão: se ele sumiu (chegou na ponta), o foco vai para o outro, nunca para o corpo.
  useLayoutEffect(() => {
    if (turn || !byButton.current) return;
    byButton.current = false;
    const root = pageRef.current;
    if (!root || root.contains(document.activeElement)) return;
    root.querySelector<HTMLButtonElement>('[data-turn]:not([hidden])')?.focus();
  }, [turn, shown]);

  if (pages.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.sheet}>
          <p className={styles.soon}>A primeira sessão sai em breve.</p>
          <div className={styles.actions}>
            <ButtonLink href={aboutHref} variant="ghost">
              Sobre o livro
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  const current = turn && turn.direction === 'older' ? turn.index : shown;

  function go(direction: TurnDirection, fromButton: boolean) {
    if (turn) return;
    const target = turnTarget(current, direction, pages.length);
    if (target === null) return;
    byButton.current = fromButton;
    const axis: TurnAxis = window.matchMedia(SPREAD_MEDIA).matches ? 'y' : 'x';
    const reduced = window.matchMedia(REDUCED_MEDIA).matches;
    const page = pages[target]!;
    setAnnouncement(`Sessão ${page.number}: ${page.title}`);
    if (direction === 'newer') {
      // Avançar: a página de baixo já é a nova; a folha levanta mostrando a antiga.
      setTurn({ index: shown, direction, axis, reduced });
      setShown(target);
    } else {
      setTurn({ index: target, direction, axis, reduced });
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return;
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== event.pointerId) return;
    const intent = swipeIntent(event.clientX - start.x, event.clientY - start.y);
    if (intent) go(intent, false);
  }

  return (
    <div
      ref={pageRef}
      className={styles.page}
      data-home-leaf=""
      data-turning={turn ? turn.axis : undefined}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipe.current = null;
      }}
    >
      <div className={styles.sheet}>
        <PageBody
          page={pages[shown]!}
          aboutHref={aboutHref}
          older={turnTarget(shown, 'older', pages.length)}
          newer={turnTarget(shown, 'newer', pages.length)}
          pages={pages}
          onTurn={(direction) => go(direction, true)}
        />
        <span ref={castRef} className={styles.cast} aria-hidden="true" />
      </div>
      {turn && (
        <div ref={leafRef} className={`${styles.sheet} ${styles.leaf}`} aria-hidden="true" inert>
          <PageBody
            page={pages[turn.index]!}
            aboutHref={aboutHref}
            older={turnTarget(turn.index, 'older', pages.length)}
            newer={turnTarget(turn.index, 'newer', pages.length)}
            pages={pages}
          />
          <span ref={shadeRef} className={styles.shade} />
        </div>
      )}
      <span className={styles.curl} aria-hidden="true" data-print="hide" />
      <span className={styles.ribbon} aria-hidden="true" data-print="hide" />
      <p className={styles.live} aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function PageBody({
  page,
  aboutHref,
  older,
  newer,
  pages,
  onTurn,
}: {
  page: LeafPage;
  aboutHref: Route;
  older: number | null;
  newer: number | null;
  pages: LeafPage[];
  onTurn?: (direction: TurnDirection) => void;
}) {
  const olderPage = older === null ? null : pages[older]!;
  const newerPage = newer === null ? null : pages[newer]!;
  return (
    <>
      <p className={styles.running}>
        Sessão {page.number} · capítulos {page.chapterFrom} a {page.chapterTo}
      </p>
      <h2 className={styles.title}>{page.title}</h2>
      {(page.date || page.membersOnly) && (
        <p className={styles.meta}>
          {page.date}
          {page.date && page.membersOnly && ' · '}
          {page.membersOnly && 'Só para membros'}
        </p>
      )}
      {page.excerpt && <p className={styles.prose}>{page.excerpt}</p>}
      <div className={styles.actions}>
        <ButtonLink href={page.href}>Ler a sessão</ButtonLink>
        <ButtonLink href={aboutHref} variant="ghost">
          Sobre o livro
        </ButtonLink>
      </div>
      <div className={styles.foot} data-print="hide">
        <button
          type="button"
          className={styles.turnBtn}
          data-turn="older"
          hidden={!olderPage}
          onClick={() => onTurn?.('older')}
          aria-label={olderPage ? `Folhear para a sessão ${olderPage.number}` : undefined}
        >
          <Icon name="left" size="sm" />
          {olderPage && `Sessão ${olderPage.number}`}
        </button>
        <span className={styles.folio} aria-hidden="true">
          {page.chapterTo}
        </span>
        <button
          type="button"
          className={`${styles.turnBtn} ${styles.turnNewer}`}
          data-turn="newer"
          hidden={!newerPage}
          onClick={() => onTurn?.('newer')}
          aria-label={newerPage ? `Folhear para a sessão ${newerPage.number}` : undefined}
        >
          {newerPage && `Sessão ${newerPage.number}`}
          <Icon name="right" size="sm" />
        </button>
      </div>
    </>
  );
}
