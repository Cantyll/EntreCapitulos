import type { Metadata } from 'next';

import { WelcomeForm } from '@/components/auth/WelcomeForm';
import { PageHeader } from '@/components/site/PageHeader';
import { Container } from '@/components/ui/Container';
import { redirectTo } from '@/lib/auth/redirect';
import { safeNext } from '@/lib/auth/safe-next';
import { isNameConfirmed, requireUser } from '@/lib/auth/session';
import { needsTermsNotice } from '@/lib/terms';
import { getTermsStatus } from '@/lib/terms/server';

export const metadata: Metadata = { title: 'Boas-vindas', robots: { index: false } };

type SearchParams = Promise<{ next?: string | string[] }>;

export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(Array.isArray(rawNext) ? rawNext[0] : rawNext);

  const user = await requireUser();
  const [nameConfirmed, status] = await Promise.all([
    isNameConfirmed(user.id),
    getTermsStatus(user.id),
  ]);
  // O que falta: o nome (primeiro acesso) e/ou o aceite dos Termos (nunca aceitou, ou versão antiga). Se a leitura
  // do aceite falhar (`unknown`), o aceite não é pedido.
  const askName = !nameConfirmed;
  const askTerms = needsTermsNotice(status);
  if (!askName && !askTerms) redirectTo(next);

  // "Leitor" é o nome de reserva do banco: nesse caso o campo começa vazio.
  const initialName = user.displayName === 'Leitor' ? '' : user.displayName;

  return (
    <Container>
      <PageHeader
        title={askName ? 'Boas-vindas ao clube' : 'Aceite dos Termos'}
        lead={
          askName
            ? 'Falta só um passo para participar das conversas.'
            : status === 'outdated'
              ? 'Atualizamos os Termos de Uso e a Política de Privacidade. Leia e aceite de novo quando puder.'
              : 'Para comentar, falta aceitar os Termos de Uso e a Política de Privacidade.'
        }
      />
      <WelcomeForm next={next} initialName={initialName} askName={askName} askTerms={askTerms} />
    </Container>
  );
}
