'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/Button';
import { logNotice } from '@/lib/auth/log';
import {
  COMPACT_MEDIA,
  clipToView,
  currentStep,
  isLastStep,
  placeCard,
  progress,
  scrollArea,
  scrollDelta,
  type Box,
  type Insets,
  type Placement,
  type TourRun,
} from '@/lib/tour';

import styles from './tour.module.css';

/*
 * O cartão de um passo do tutorial (etapa 8k), num portal FORA do painel (que fica `inert` nos passos "info" e
 * "go"). No computador ele se ancora ao alvo (abaixo ou acima, com seta). No celular é um balão junto do alvo, da
 * largura da tela, e, quando não cabe, uma folha presa à borda (embaixo ou em cima, a que deixar à vista o começo do
 * alvo); a regra está em `src/lib/tour/placement.ts`. Sem alvo na tela: centralizado (computador) ou folha embaixo
 * (celular).
 *
 *  - Rolagem: o alvo vai para onde o cartão que vai caber deixa espaço (`scrollArea`). Alvos presos à tela (barra de
 *    baixo, barra de ações da Página Sobre, cabeçalho, barra lateral) não rolam. No celular a rolagem é instantânea:
 *    uma rolagem suave faria o cartão pular de lugar no meio dela.
 *  - No celular, um espaço extra no fim da página (só enquanto o passo está aberto) deixa rolar o último bloco da
 *    página para cima do cartão.
 *  - O destaque é recortado à janela; o texto do cartão rola por dentro e os botões ficam sempre visíveis.
 *
 *  - info/go: `aria-modal="true"`, Tab preso no cartão.
 *  - try: `aria-modal="false"`, o painel continua interativo e o foco solto (a pessoa toca no elemento real); o
 *    "Próximo" continua lá.
 *  - Esc sai, setas navegam, o foco vai para o cartão a cada passo e volta a quem abriu ao sair.
 *  - Nunca foca campo de texto nem abre o teclado. Sem animação (nada a desligar com reduced-motion).
 */

const BLOCKED_TEXT =
  'Esta tela tem alterações que ainda não foram salvas. Salve (ou descarte) antes de continuar o tour: ele nunca apaga o seu texto.';

function subscribeCompact(callback: () => void): () => void {
  const media = window.matchMedia(COMPACT_MEDIA);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

/**
 * Alvo que a rolagem não move: dentro de algo `fixed` (barra de baixo) ou, já visível, dentro de algo `sticky`
 * (cabeçalho, barra de ações da Página Sobre). Um `sticky` fora da tela (a barra de formatação do editor antes de
 * grudar, no celular deitado) ainda precisa rolar até aparecer.
 */
function isPinned(element: HTMLElement, box: Box, viewHeight: number): boolean {
  let sticky = false;
  for (
    let node: HTMLElement | null = element;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const position = getComputedStyle(node).position;
    if (position === 'fixed') return true;
    if (position === 'sticky') sticky = true;
  }
  return sticky && box.top >= 0 && box.top + box.height <= viewHeight;
}

/** As áreas seguras do aparelho, lidas de uma sonda com `padding: env(safe-area-inset-*)`. */
function readInsets(probe: HTMLElement | null): Insets {
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const style = getComputedStyle(probe);
  return {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
}

function findVisible(name: string): HTMLElement | null {
  const selector = `[data-tour="${CSS.escape(name)}"]`;
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    if (getComputedStyle(element).visibility === 'hidden') continue;
    return element;
  }
  return null;
}

function toBox(rect: DOMRect): Box {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function viewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

/** Altura da barra fixa de baixo do painel (só no celular; some nas telas do editor). */
function bottomBarHeight(viewHeight: number): number {
  const bar = document.querySelector('[data-admin-tabbar]');
  if (!bar) return 0;
  const box = bar.getBoundingClientRect();
  return box.height > 0 && box.top < viewHeight ? Math.max(0, viewHeight - box.top) : 0;
}

function headerBottom(): number {
  const header = document.querySelector('[data-admin-topbar]');
  return header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
}

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

type Layout = { ring: Box | null; placement: Placement };

export function TourCard({
  run,
  onRoute,
  blocked,
  onRetry,
  onNext,
  onBack,
  onExit,
  onContinue,
}: {
  run: TourRun;
  onRoute: boolean;
  blocked: boolean;
  onRetry: () => void;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
  onContinue: (() => void) | null;
}) {
  const step = currentStep(run);
  const { position, total, chapter } = progress(run);
  const last = isLastStep(run);
  const modal = step.kind !== 'try';
  const titleId = useId();
  const bodyId = useId();
  const progressId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  // Depois que o passo virou folha no celular, ele continua folha (ver `placeCard`).
  const sheetLockRef = useRef(false);
  const compact = useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_MEDIA).matches,
    () => false,
  );
  // O alvo deste passo: `null` enquanto procura (até ~1,5 s, a página pode estar chegando), `missing` sem alvo.
  const [target, setTarget] = useState<HTMLElement | 'missing' | null>(
    step.target ? null : 'missing',
  );
  const [layout, setLayout] = useState<Layout | null>(null);

  // Procura o alvo (só depois de chegar à página do passo).
  useEffect(() => {
    if (!onRoute || !step.target) return;
    const names = step.altTarget ? [step.target, step.altTarget] : [step.target];
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function look() {
      const element = names.map(findVisible).find(Boolean) ?? null;
      if (element) {
        setTarget(element);
        return;
      }
      if (performance.now() - startedAt > 1500) {
        // Interface mudou, item dentro de "Mais", tela pequena: cartão centralizado, e só o id do passo no registro.
        logNotice('tutorial: alvo ausente', step.id);
        setTarget('missing');
        return;
      }
      frame = requestAnimationFrame(look);
    });
    return () => cancelAnimationFrame(frame);
  }, [onRoute, step]);

  // Rola até o alvo (respeitando o cabeçalho e o lugar do cartão) e acompanha a posição dele.
  useEffect(() => {
    const element = target instanceof HTMLElement ? target : null;
    let frame = 0;
    let lastKey = '';
    const currentView = () => {
      const height = viewportHeight();
      return {
        width: window.innerWidth,
        height,
        headerBottom: headerBottom(),
        insets: readInsets(probeRef.current),
        bottomBar: bottomBarHeight(height),
      };
    };
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const card = cardRef.current?.getBoundingClientRect();
        const box = element && element.isConnected ? toBox(element.getBoundingClientRect()) : null;
        const view = currentView();
        // Só refaz o cartão quando algo mudou de fato (a medida também roda de tempos em tempos, abaixo).
        const key = JSON.stringify([box, card?.width, card?.height, view, compact]);
        if (key === lastKey) return;
        lastKey = key;
        const placement = placeCard(
          box,
          { width: card?.width ?? 360, height: card?.height ?? 220 },
          view,
          compact,
          sheetLockRef.current ? 'sheet' : undefined,
        );
        if (compact && box && placement.kind === 'sheet') sheetLockRef.current = true;
        setLayout({ ring: box ? clipToView(box, view, 6) : null, placement });
      });
    };
    const startBox = element ? toBox(element.getBoundingClientRect()) : null;
    if (element && startBox && !isPinned(element, startBox, viewportHeight())) {
      const box = startBox;
      const card = cardRef.current?.getBoundingClientRect();
      const area = scrollArea(
        currentView(),
        { width: card?.width ?? 360, height: card?.height ?? 220 },
        compact,
        box.height,
      );
      const delta = scrollDelta(box, area);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (delta !== 0) {
        window.scrollBy({ top: delta, behavior: compact || reduce ? 'auto' : 'smooth' });
      }
    }
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    const observer = new ResizeObserver(measure);
    if (element) observer.observe(element);
    if (cardRef.current) observer.observe(cardRef.current);
    // O alvo pode mudar de lugar sem rolagem nem mudança de tamanho (algo acima dele cresceu, uma fonte carregou):
    // uma medida leve de tempos em tempos enquanto o passo está aberto.
    const timer = window.setInterval(measure, 150);
    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [target, compact]);

  // Foco no cartão a cada passo (o leitor de tela lê o título e o texto).
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, []);

  // Esc sai de qualquer lugar (no passo "try" o foco pode estar fora do cartão).
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        onExit();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onExit]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight' && !blocked) {
      event.preventDefault();
      if (last && onContinue) onContinue();
      else onNext();
      return;
    }
    if (event.key === 'ArrowLeft' && position > 1) {
      event.preventDefault();
      onBack();
      return;
    }
    if (event.key !== 'Tab' || !modal) return;
    const card = cardRef.current;
    if (!card) return;
    const items = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0]!;
    const final = items.at(-1)!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === card)) {
      event.preventDefault();
      final.focus();
    } else if (!event.shiftKey && active === final) {
      event.preventDefault();
      first.focus();
    }
  }

  const placement: Placement =
    layout?.placement ?? (compact ? { kind: 'sheet', side: 'bottom' } : { kind: 'center' });
  const ring = layout?.ring ?? null;
  const style: CSSProperties | undefined =
    placement.kind === 'anchored'
      ? { top: placement.top, left: placement.left, width: placement.width }
      : undefined;
  const placementClass =
    placement.kind === 'sheet'
      ? `${styles.sheet} ${placement.side === 'top' ? styles.sheetTop : styles.sheetBottom}`
      : styles[placement.kind];
  const side =
    placement.kind === 'sheet' || placement.kind === 'anchored' ? placement.side : undefined;

  const missingTarget = target === 'missing' && step.target ? step.target : undefined;

  return createPortal(
    <>
      <span ref={probeRef} className={styles.insetsProbe} aria-hidden="true" />
      {compact && <div className={styles.scrollRoom} aria-hidden="true" data-tour-room="" />}
      {ring && (
        <div
          className={styles.ring}
          data-tour-ring=""
          aria-hidden="true"
          style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal={modal}
        aria-labelledby={titleId}
        aria-describedby={`${progressId} ${bodyId}`}
        tabIndex={-1}
        className={`${styles.card} ${placementClass}`}
        style={style}
        onKeyDown={onKeyDown}
        data-tour-card=""
        data-tour-step={step.id}
        data-tour-placement={placement.kind}
        data-tour-side={side}
        data-tour-missing={missingTarget}
      >
        <div className={styles.content}>
          <p id={progressId} className={styles.progress}>
            Passo {position} de {total} · {chapter.number}. {chapter.title}
          </p>
          <h2 id={titleId} className={styles.title}>
            {blocked ? 'Antes de continuar' : step.title}
          </h2>
          <p id={bodyId} className={styles.body}>
            {blocked ? BLOCKED_TEXT : step.body}
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onExit}>
            Sair
          </Button>
          <span className={styles.spacer} />
          {position > 1 && !blocked && (
            <Button variant="soft" onClick={onBack}>
              Voltar
            </Button>
          )}
          {last && onContinue && !blocked ? (
            <>
              <Button variant="soft" onClick={onNext}>
                Concluir
              </Button>
              <Button onClick={onContinue}>Continuar o tour</Button>
            </>
          ) : (
            <Button onClick={blocked ? onRetry : onNext}>
              {blocked ? 'Tentar de novo' : last ? 'Concluir' : 'Próximo'}
            </Button>
          )}
        </div>
        {placement.kind === 'anchored' && (
          <span
            className={`${styles.arrow} ${placement.side === 'below' ? styles.arrowTop : styles.arrowBottom}`}
            style={{ left: placement.arrowX }}
            aria-hidden="true"
          />
        )}
      </div>
    </>,
    document.body,
  );
}
