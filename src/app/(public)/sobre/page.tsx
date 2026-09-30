import type { Metadata } from 'next';

import { PageHeader } from '@/components/site/PageHeader';
import { Container } from '@/components/ui/Container';
import { StubNotice } from '@/components/ui/StubNotice';

export const metadata: Metadata = { title: 'Sobre o clube' };

export default function AboutPage() {
  return (
    <Container>
      <PageHeader title="Oi, eu sou a Agatha." />
      <StubNotice>
        No protótipo, esta página conta a história do clube, explica como ele funciona e lista os
        combinados da comunidade.
      </StubNotice>
    </Container>
  );
}
