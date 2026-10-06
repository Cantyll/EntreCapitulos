import { unstable_rethrow } from 'next/navigation';

import { getCurrentUserOrNull } from '@/lib/auth/current-user';
import { logFailure } from '@/lib/auth/log';
import type { CurrentUser } from '@/lib/auth/session';
import { needsTermsNotice } from '@/lib/terms';
import { getTermsStatus } from '@/lib/terms/server';

import { TermsNoticeBar } from './TermsNoticeBar';

type Notice = { status: 'missing' | 'outdated'; staff: boolean };

/** O que mostrar (ou nada). Nunca lança: qualquer falha vira "sem aviso". */
async function findNotice(user: CurrentUser | null | undefined): Promise<Notice | null> {
  try {
    const person = user === undefined ? await getCurrentUserOrNull('aviso dos Termos') : user;
    if (!person) return null;
    const status = await getTermsStatus(person.id);
    if (!needsTermsNotice(status)) return null;
    return {
      status: status === 'outdated' ? 'outdated' : 'missing',
      staff: person.role !== 'member',
    };
  } catch (error) {
    unstable_rethrow(error);
    logFailure('aviso dos Termos', error);
    return null;
  }
}

/**
 * O aviso do aceite dos Termos (etapa 8g): para quem está logado e nunca aceitou (ou aceitou uma versão antiga), a
 * equipe inclusa. Não bloqueia nada: só leva a /boas-vindas. Visitante e quem já aceitou não veem; se a leitura do
 * aceite falhar (`unknown`, por exemplo a migration ainda não aplicada) também não aparece. Nunca derruba a página.
 *
 * `user` só vem quando o layout já sabe quem é (painel); o layout público deixa o componente descobrir.
 */
export async function TermsNotice({ user }: { user?: CurrentUser | null }) {
  const notice = await findNotice(user);
  if (!notice) return null;
  return <TermsNoticeBar status={notice.status} staff={notice.staff} />;
}
