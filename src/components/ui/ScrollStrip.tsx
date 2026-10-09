'use client';

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';

import { cx } from '@/lib/cx';
import { revealOffset, stripFade } from '@/lib/scroll-strip';

import styles from './ScrollStrip.module.css';

const ACTIVE = '[aria-current="page"], [aria-selected="true"]';

type ScrollStripProps = HTMLAttributes<HTMLElement> & {
  as?: 'nav' | 'div';
  /** Muda a cada navegação (o caminho, o livro escolhido): o item atual volta a ficar à vista. */
  revealKey?: string;
  children: ReactNode;
};

function updateFade(el: HTMLElement) {
  const fade = stripFade(el.scrollLeft, el.scrollWidth, el.clientWidth);
  if (fade) el.dataset.fade = fade;
  else delete el.dataset.fade;
}

/** Rola a faixa (nunca a página) só o necessário para o item ficar inteiro fora das bordas esfumadas. */
function reveal(el: HTMLElement, item: Element) {
  const strip = el.getBoundingClientRect();
  const box = item.getBoundingClientRect();
  const delta = revealOffset(box.left - strip.left, box.right - strip.left, el.clientWidth);
  if (delta !== 0) el.scrollLeft += delta;
}

/**
 * Faixa que rola de lado no celular (menu do site, abas de livros, barra de formatação). Sem barra de rolagem à vista,
 * nada dizia que havia mais itens, e o item atual podia ficar cortado na borda. Aqui o lado que ainda tem itens fica
 * esfumado (`data-fade`), o item atual aparece inteiro ao abrir a página e o item que recebe o foco pelo teclado nunca
 * fica escondido na borda. Quem usa decide o resto do visual pela própria classe.
 */
export function ScrollStrip({
  as: Tag = 'nav',
  revealKey,
  className,
  children,
  ...rest
}: ScrollStripProps) {
  // HTMLDivElement serve aos dois desenhos (o <nav> é um HTMLElement, e a faixa só usa o que os dois têm).
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector(ACTIVE);
    if (active) reveal(el, active);
    updateFade(el);
  }, [revealKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => updateFade(el);
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target !== el) reveal(el, event.target);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('focusin', onFocus);
    // A largura dos itens muda quando a fonte chega e quando a janela gira: as bordas são medidas de novo.
    const observer = new ResizeObserver(() => updateFade(el));
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('focusin', onFocus);
      observer.disconnect();
    };
  }, []);

  return (
    <Tag ref={ref} className={cx(styles.strip, className)} {...rest}>
      {children}
    </Tag>
  );
}
