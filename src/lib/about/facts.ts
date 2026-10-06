export type AboutFact = { value: number; label: string };

/**
 * Os números reais da página (livros terminados e sessões publicadas), só os que não são zero. Nunca inventa número.
 * A página pública e a pré-visualização do painel usam esta mesma função.
 */
export function aboutFacts(books: number, sessions: number): AboutFact[] {
  const facts: AboutFact[] = [];
  if (books > 0)
    facts.push({ value: books, label: books === 1 ? 'livro terminado' : 'livros terminados' });
  if (sessions > 0) {
    facts.push({
      value: sessions,
      label: sessions === 1 ? 'sessão publicada' : 'sessões publicadas',
    });
  }
  return facts;
}
