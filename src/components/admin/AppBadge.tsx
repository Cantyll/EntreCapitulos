'use client';

import { useEffect } from 'react';

import { applyAppBadge } from '@/lib/pwa/badge';

/**
 * Atualiza o selo do ícone do app com a contagem de comentários pendentes (`navigator.setAppBadge`; zero
 * apaga o selo). Não desenha nada. Só atualiza com o painel ABERTO: o painel refaz a contagem a cada
 * moderação (`revalidatePath('/painel', 'layout')`), e este componente recebe o número novo. Sem a API (ou
 * fora do app instalado) não faz nada e não dá erro.
 */
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    void applyAppBadge(typeof navigator === 'undefined' ? undefined : navigator, count);
  }, [count]);
  return null;
}
