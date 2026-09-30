import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/site/PageHeader';
import { Container } from '@/components/ui/Container';
import { StubNotice } from '@/components/ui/StubNotice';
import { bookHref } from '@/lib/routes';
import { currentBook } from '@/lib/sample-data';

type Props = PageProps<'/livros/[slug]/sessoes/[numero]'>;

// A numeração das sessões reinicia a cada livro, por isso a sessão mora sob /livros/[slug].
const SESSION_NUMBER = /^[1-9]\d*$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, numero } = await params;
  if (slug !== currentBook.slug || !SESSION_NUMBER.test(numero)) return {};
  return { title: `Sessão ${numero} · ${currentBook.title}` };
}

export default async function SessionPage({ params }: Props) {
  const { slug, numero } = await params;
  if (slug !== currentBook.slug || !SESSION_NUMBER.test(numero)) notFound();

  return (
    <Container>
      <PageHeader
        back={{ href: bookHref(slug), label: `Voltar para ${currentBook.title}` }}
        eyebrow={currentBook.title}
        title={`Sessão ${numero}`}
      />
      <StubNotice>
        No protótipo, a sessão traz o relato dividido por capítulo com o filtro de spoiler, as
        reações, as perguntas para a discussão e os comentários.
      </StubNotice>
    </Container>
  );
}
