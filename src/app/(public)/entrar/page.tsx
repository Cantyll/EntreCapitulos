import type { Metadata } from 'next';

import { PageHeader } from '@/components/site/PageHeader';
import { Container } from '@/components/ui/Container';
import { StubNotice } from '@/components/ui/StubNotice';

export const metadata: Metadata = { title: 'Entrar' };

export default function SignInPage() {
  return (
    <Container>
      <PageHeader
        back={{ href: '/', label: 'Voltar para o início' }}
        title="Entre para o clube"
        lead="Comente as sessões, vote no próximo livro e receba as novidades."
      />
      <StubNotice>
        O login chega com o Supabase, na Fase 1: Google e código de 6 dígitos por e-mail.
      </StubNotice>
    </Container>
  );
}
