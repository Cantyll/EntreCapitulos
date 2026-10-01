import { getProgress, isValidBookSlug, type ProgressMap } from './cookie';
import { parseProgress } from './rules';

/**
 * Plano da migração do progresso do cookie para o banco ao entrar: uma linha por livro conhecido,
 * com o capítulo dentro do total do livro. Entradas de livros que não existem (ou com capítulo
 * inválido) são ignoradas. Pura: quem chama grava com "inserir ignorando duplicadas", para nunca
 * sobrescrever um progresso que já está no banco.
 */
export function planProgressMigration(
  map: ProgressMap,
  books: readonly { id: string; slug: string; totalChapters: number }[],
): { book_id: string; chapter: number }[] {
  const rows: { book_id: string; chapter: number }[] = [];
  for (const book of books) {
    if (!isValidBookSlug(book.slug)) continue;
    const chapter = parseProgress(getProgress(map, book.slug), book.totalChapters);
    if (chapter !== null) rows.push({ book_id: book.id, chapter });
  }
  return rows;
}
