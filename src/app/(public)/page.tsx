import { PageHeader } from '@/components/site/PageHeader';
import { Container } from '@/components/ui/Container';
import { StubNotice } from '@/components/ui/StubNotice';
import { currentBook } from '@/lib/sample-data';

export default function HomePage() {
  return (
    <Container>
      <PageHeader
        eyebrow="Lendo agora"
        live
        title={currentBook.title}
        lead={`de ${currentBook.author}`}
      />
      <StubNotice>
        No protótipo, esta página abre com a faixa do livro atual (capa, fita de capítulos e última
        sessão), lista as sessões e traz os cartões de votação, anotação da semana, e-mail e
        membros.
      </StubNotice>
    </Container>
  );
}
