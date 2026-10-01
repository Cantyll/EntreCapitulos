import { isMarginNoteVisible } from './rules';

/** Uma nota de sessão, com o que decide se ela aparece em "Anotações na margem". */
export type MarginNoteLike = { sessionNumber: number; chapterTo: number };

export const MARGIN_NOTES_LIMIT = 4;

/**
 * "Anotações na margem" da página do livro: só as notas de sessões que a pessoa já terminou de ler
 * (`chapter_to` ≤ progresso), das sessões mais novas para as mais antigas. Sem progresso conhecido, o
 * bloco inteiro some (nada é mostrado).
 */
export function pickMarginNotes<T extends MarginNoteLike>(
  notes: readonly T[],
  progress: number | null,
  limit = MARGIN_NOTES_LIMIT,
): T[] {
  if (progress === null) return [];
  return notes
    .filter((n) => isMarginNoteVisible(progress, n.chapterTo))
    .sort((a, b) => b.sessionNumber - a.sessionNumber)
    .slice(0, limit);
}
