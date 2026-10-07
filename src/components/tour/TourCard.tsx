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
  SHEET_MEDIA,
  currentStep,
  isLastStep,
  placeCard,
  progress,
  scrollDelta,
  type Box,
  type Placement,
  type TourRun,
} from '@/lib/tour';

import styles from './tour.module.css';

/*
 * O cartão de um passo do tutorial (etapa 8k), num portal FORA do painel (que fica `inert` nos passos "info" e
 * "go"). No computador ele se ancora ao alvo (abaixo ou acima, com seta); no celular vira folha inferior, com safe
 * areas, e o alvo rola para a área livre acima dela. Sem alvo na tela: cartão centralizado.
 *
 *  - info/go: `aria-modal="true"`, Tab preso no cartão.
 *  - try: `aria-modal="false"`, o painel continua interativo e o foco solto (a pessoa toca no elemento real); o
 *    "Próximo" continua lá.
 *  - Esc sai, setas navegam, o foco vai para o cartão a cada passo e volta a quem abriu ao sair.
 *  - Nunca foca campo de texto nem abre o teclado. Sem animação (nada a desligar com reduced-motion).
 */

const BLOCKED_TEXT =
  'Esta tela tem alterações que ainda não foram salvas. Salve (ou descarte) antes de continuar o tour: ele nunca apaga o seu texto.';

function subscribeSheet(callback: () => void): () => void {
  const media = window.matchMedia(SHEET_MEDIA);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
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

function headerBottom(): number {
  const header = document.querySelector('[data-admin-topbar]');
  return header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
}

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

type Layout = { target: Box | null; placement: Placement };

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
  const sheet = useSyncExternalStore(
    subscribeSheet,
    () => window.matchMedia(SHEET_MEDIA).matches,
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
    const name = step.target;
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function look() {
      const element = findVisible(name);
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

  // Rola até o alvo (respeitando o cabeçalho e a folha inferior) e acompanha a posição dele.
  useEffect(() => {
    const element = target instanceof HTMLElement ? target : null;
    let frame = 0;
    let lastKey = '';
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const card = cardRef.current?.getBoundingClientRect();
        const box = element && element.isConnected ? toBox(element.getBoundingClientRect()) : null;
        const view = {
          width: window.innerWidth,
          height: viewportHeight(),
          headerBottom: headerBottom(),
        };
        // Só refaz o cartão quando algo mudou de fato (a medida também roda de tempos em tempos, abaixo).
        const key = JSON.stringify([box, card?.width, card?.height, view, sheet]);
        if (key === lastKey) return;
        lastKey = key;
        setLayout({
          target: box,
          placement: placeCard(
            box,
            { width: card?.width ?? 360, height: card?.height ?? 220 },
            view,
            sheet,
          ),
        });
      });
    };
    if (element) {
      const box = toBox(element.getBoundingClientRect());
      const sheetHeight = sheet ? (cardRef.current?.getBoundingClientRect().height ?? 0) : 0;
      const area = { top: headerBottom() + 12, bottom: viewportHeight() - sheetHeight - 12 };
      const delta = scrollDelta(box, area);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (delta !== 0) window.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' });
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
  }, [target, sheet]);

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

  const placement = layout?.placement ?? { kind: sheet ? 'sheet' : 'center' };
  const ring = layout?.target ?? null;
  const style: CSSProperties | undefined =
    placement.kind === 'anchored' ? { top: placement.top, left: placement.left } : undefined;

  const missingTarget = target === 'missing' && step.target ? step.target : undefined;

  return createPortal(
    <>
      {ring && (
        <div
          className={styles.ring}
          data-tour-ring=""
          aria-hidden="true"
          style={{
            top: ring.top - 6,
            left: ring.left - 6,
            width: ring.width + 12,
            height: ring.height + 12,
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal={modal}
        aria-labelledby={titleId}
        aria-describedby={`${progressId} ${bodyId}`}
        tabIndex={-1}
        className={`${styles.card} ${styles[placement.kind]}`}
        style={style}
        onKeyDown={onKeyDown}
        data-tour-card=""
        data-tour-step={step.id}
        data-tour-placement={placement.kind}
        data-tour-missing={missingTarget}
      >
        <p id={progressId} className={styles.progress}>
          Passo {position} de {total} · {chapter.number}. {chapter.title}
        </p>
        <h2 id={titleId} className={styles.title}>
          {blocked ? 'Antes de continuar' : step.title}
        </h2>
        <p id={bodyId} className={styles.body}>
          {blocked ? BLOCKED_TEXT : step.body}
        </p>
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
