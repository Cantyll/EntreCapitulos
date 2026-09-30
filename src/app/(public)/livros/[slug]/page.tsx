import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/site/PageHeader';
import { Container } from '@/components/ui/Container';
import { StubNotice } from '@/components/ui/StubNotice';
import { currentBook } from '@/lib/sample-data';

type Props = PageProps<'/livros/[slug]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return slug === currentBook.slug ? { title: currentBook.title } : {};
}

export default async function BookPage({ params }: Props) {
  const { slug } = await params;
  if (slug !== currentBook.slug) notFound();

  return (
    <Container>
      <PageHeader
        back={{ href: '/', label: 'Voltar para o início' }}
        eyebrow="Lendo agora"
        live
        title={currentBook.title}
        lead={`de ${currentBook.author}`}
      />
      <StubNotice>
        No protótipo, a página do livro tem a sinopse, os números da leitura, o mapa de capítulos, a
        linha do tempo e as anotações na margem.
      </StubNotice>
    </Container>
  );
}
