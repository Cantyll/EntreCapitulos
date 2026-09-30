import type { Metadata } from 'next';

import { PageHeader } from '@/components/site/PageHeader';
import { Container } from '@/components/ui/Container';
import { StubNotice } from '@/components/ui/StubNotice';

export const metadata: Metadata = { title: 'Estante' };

export default function ShelfPage() {
  return (
    <Container>
      <PageHeader title="Estante do clube" />
      <StubNotice>
        No protótipo, a estante tem as abas Lidos (com nota e número de sessões) e Na fila.
      </StubNotice>
    </Container>
  );
}
