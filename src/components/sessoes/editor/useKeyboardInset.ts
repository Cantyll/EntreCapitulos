'use client';

import { useEffect, useState } from 'react';

import { keyboardInset } from '@/lib/session-editor/viewport';

/** Quanto o teclado cobre do fim da janela, em px (0 sem teclado e em telas sem `visualViewport`). */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setInset(
          keyboardInset({
            innerHeight: window.innerHeight,
            height: viewport.height,
            offsetTop: viewport.offsetTop,
            scale: viewport.scale,
          }),
        );
      });
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
