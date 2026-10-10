'use client';

import { useLinkStatus } from 'next/link';

/*
 * Marca o link que acabou de ser tocado enquanto a página nova não chega. Vai DENTRO de um `<Link>`: sem espaço
 * nem conteúdo, só o atributo `data-pending`, que o CSS do próprio link lê com `:has([data-pending='true'])` (o
 * link ganha o estado de "ativo" na hora, em vez de esperar o servidor). Não muda o tamanho de nada.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" data-pending={pending ? 'true' : 'false'} hidden />;
}
