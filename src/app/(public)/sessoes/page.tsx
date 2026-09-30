import type { Metadata } from 'next';

import { PageHeader } from '@/components/site/PageHeader';
import { Container } from '@/components/ui/Container';
import { StubNotice } from '@/components/ui/StubNotice';

export const metadata: Metadata = { title: 'Sessões' };

export default function SessionsPage() {
  return (
    <Container>
      <PageHeader
        title="Sessões de leitura"
        lead="Cada sessão cobre alguns capítulos, com o relato da Agatha e a conversa do clube."
      />
      <StubNotice>
        No protótipo, esta página lista as sessões do livro atual, com abas para os livros
        anteriores.
      </StubNotice>
    </Container>
  );
}
