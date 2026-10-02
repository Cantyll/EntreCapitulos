import type { Metadata } from 'next';

import { WelcomeForm } from '@/components/auth/WelcomeForm';
import { LegalLinks } from '@/components/legal/LegalLinks';
import { PageHeader } from '@/components/site/PageHeader';
import { Container } from '@/components/ui/Container';
import { redirectTo } from '@/lib/auth/redirect';
import { safeNext } from '@/lib/auth/safe-next';
import { isNameConfirmed, requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Boas-vindas', robots: { index: false } };

type SearchParams = Promise<{ next?: string | string[] }>;

export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(Array.isArray(rawNext) ? rawNext[0] : rawNext);

  const user = await requireUser();
  if (await isNameConfirmed(user.id)) redirectTo(next);

  // "Leitor" é o nome de reserva do banco: nesse caso o campo começa vazio.
  const initialName = user.displayName === 'Leitor' ? '' : user.displayName;

  return (
    <Container>
      <PageHeader
        title="Boas-vindas ao clube"
        lead="Falta só um passo para participar das conversas."
      />
      <WelcomeForm next={next} initialName={initialName} />
      <LegalLinks verb="continuar" />
    </Container>
  );
}
