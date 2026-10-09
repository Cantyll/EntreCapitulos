'use client';

import { useEffect, useLayoutEffect, type RefObject } from 'react';

const growsByItself = () =>
  typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content') === true;

function fit(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Caixa de texto que cresce com o conteúdo, sem rolagem por dentro. Onde o navegador já faz isso sozinho
 * (`field-sizing: content`, no CSS de quem usa) o hook não mexe em nada; nos outros (Safari do iOS 16 a 18) ele mede a
 * altura a cada mudança do texto e quando a largura muda (girar o aparelho, abrir a barra lateral).
 */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !growsByItself()) fit(el);
  }, [ref, value]);

  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent || growsByItself()) return;
    let width = parent.clientWidth;
    const observer = new ResizeObserver(() => {
      if (parent.clientWidth === width) return;
      width = parent.clientWidth;
      fit(el);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [ref]);
}
