import type { Metadata } from 'next';
import { cache } from 'react';

import { AboutView } from '@/components/sobre/AboutView';
import { Container } from '@/components/ui/Container';
import { aboutFacts, richDocText } from '@/lib/about';
import { getPublishedAbout } from '@/lib/about/queries';
import { loadShelf } from '@/lib/public/loaders';
import { getViewer } from '@/lib/public/person';
import { truncateAtWord } from '@/lib/session-body';

/*
 * `/sobre` mostra o conteúdo PUBLICADO pela administração (Painel > Página Sobre) ou, se nada foi publicado, o texto
 * padrão de `src/content/sobre.ts` (também se a leitura falhar). Título e descrição da página saem do conteúdo. A
 * leitura é a mesma na página e nos metadados (`cache` de uma requisição; o cache de dados é o `unstable_cache`).
 */
const loadAbout = cache(getPublishedAbout);

const DESCRIPTION_MAX = 160;
const TITLE_MAX = 70;

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await loadAbout();
  return {
    title: truncateAtWord(content.title, TITLE_MAX),
    description: truncateAtWord(richDocText(content.intro), DESCRIPTION_MAX),
  };
}

export default async function AboutPage() {
  const [{ content }, { finished, counts }, viewer] = await Promise.all([
    loadAbout(),
    loadShelf(),
    getViewer(),
  ]);

  // Números só do banco, e só os que não são zero.
  const sessions = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const facts = aboutFacts(finished.length, sessions);

  return (
    <Container>
      <AboutView content={content} facts={facts} showCta={!viewer} />
    </Container>
  );
}
