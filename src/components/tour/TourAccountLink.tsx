'use client';

import { ButtonLink } from '@/components/ui/Button';
import { tutorialHref } from '@/lib/tour/intent';
import { updateTourStorage } from '@/lib/tour/store';

/*
 * Em Minha conta, só para a equipe (etapa 8k): abre no painel o capítulo "Conta e instalação" do tutorial. O "?"
 * só existe no painel; este link é a "Ajuda desta tela" de /conta.
 *
 * O clique grava uma intenção de uso único (com a hora) no armazenamento da aba; o painel só começa o tour com ela
 * (ver `src/lib/tour/intent.ts`). O endereço sozinho nunca abre o tour.
 */
export function TourAccountLink({ role }: { role: 'admin' | 'moderator' }) {
  const href = tutorialHref('conta', role === 'admin' ? '/painel' : '/painel/comentarios');
  return (
    <ButtonLink
      href={href as never}
      variant="soft"
      onClick={() =>
        updateTourStorage((previous) => ({
          ...previous,
          intent: { value: 'conta', at: Date.now() },
        }))
      }
    >
      Ver o tutorial desta parte
    </ButtonLink>
  );
}
