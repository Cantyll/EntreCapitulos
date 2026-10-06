'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Aviso ao sair com alterações não salvas. Cobre o que um site consegue cobrir: fechar ou recarregar a aba
 * (`beforeunload`) e clicar num link do app (um diálogo de confirmação, feito pelo chamador com `pendingHref`).
 * NÃO cobre o botão "voltar" do navegador nem o gesto de voltar do iOS: o App Router não oferece gancho para isso.
 * Por isso a tela mostra sempre o estado ("Alterações não salvas") e tem o botão de salvar à vista.
 */
export function useUnsavedGuard(dirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const allow = useRef(false);

  useEffect(() => {
    if (!dirty) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (allow.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    // Captura ANTES do clique chegar ao `<Link>` do Next: um link interno vira "pergunte antes de sair".
    const onClick = (event: MouseEvent) => {
      if (allow.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.(
        'a[href]',
      ) as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Âncora dentro da mesma página: não sai de lugar nenhum.
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    };

    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  const stay = useCallback(() => setPendingHref(null), []);
  const leave = useCallback(() => {
    if (pendingHref === null) return;
    allow.current = true;
    const href = pendingHref;
    setPendingHref(null);
    router.push(href as Route);
  }, [pendingHref, router]);

  return { pendingHref, stay, leave };
}
