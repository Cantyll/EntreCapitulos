import type { Metadata } from 'next';

import { SignInForm } from '@/components/auth/SignInForm';
import { PageHeader } from '@/components/site/PageHeader';
import { Container } from '@/components/ui/Container';
import { loginErrorMessage } from '@/lib/auth/messages';
import { redirectTo } from '@/lib/auth/redirect';
import { postLoginDestination, safeNext } from '@/lib/auth/safe-next';
import { getCurrentUser, isNameConfirmed } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Entrar' };

type SearchParams = Promise<{ next?: string | string[]; erro?: string | string[] }>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNext(first(params.next));

  const user = await getCurrentUser();
  if (user) redirectTo(postLoginDestination(next, await isNameConfirmed(user.id)));

  return (
    <Container>
      <PageHeader
        back={{ href: '/', label: 'Voltar para o início' }}
        title="Entre para o clube"
        lead="Comente as sessões, vote no próximo livro e receba as novidades."
      />
      <SignInForm next={next} initialError={loginErrorMessage(first(params.erro))} />
    </Container>
  );
}
