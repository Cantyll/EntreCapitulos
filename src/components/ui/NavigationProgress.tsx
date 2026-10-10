'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { PROGRESS_TIMEOUT_MS, shouldTrackNavigation } from '@/lib/navigation-progress';

import styles from './NavigationProgress.module.css';

type State = 'idle' | 'loading' | 'done';

/*
 * A linha de lápis sob o topo da tela: começa no quadro do toque num link interno e termina quando o endereço muda
 * (a página nova chegou). Enquanto o servidor responde é o único sinal de que o toque foi ouvido. Só `transform` e
 * `opacity` (rodam no compositor, mesmo com o navegador ocupado). Sem JavaScript ou antes da hidratação não aparece
 * e nada quebra. A linha só fica visível depois de uns instantes: navegação que termina rápido não pisca.
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<State>('idle');
  const timers = useRef<number[]>([]);
  const route = `${pathname}?${search}`;
  const lastRoute = useRef(route);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  // O endereço mudou: a página chegou.
  useEffect(() => {
    if (lastRoute.current === route) return;
    lastRoute.current = route;
    clearTimers();
    setState((current) => (current === 'loading' ? 'done' : current));
    timers.current.push(window.setTimeout(() => setState('idle'), 450));
  }, [route]);

  // Clique em link interno: começa. O `capture` pega o clique antes de qualquer outro tratador.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.(
        'a[href]',
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const track = shouldTrackNavigation(
        {
          button: event.button,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          defaultPrevented: event.defaultPrevented,
        },
        {
          href: anchor.href,
          target: anchor.getAttribute('target') ?? '',
          download: anchor.hasAttribute('download'),
        },
        window.location.href,
      );
      if (!track) return;
      clearTimers();
      setState('loading');
      // Rede parada ou erro: a linha não fica presa.
      timers.current.push(
        window.setTimeout(() => {
          setState('done');
          timers.current.push(window.setTimeout(() => setState('idle'), 450));
        }, PROGRESS_TIMEOUT_MS),
      );
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      clearTimers();
    };
  }, []);

  return <div className={styles.bar} data-state={state} data-print="hide" aria-hidden="true" />;
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
