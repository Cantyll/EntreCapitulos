/** "Sessão N: capítulos X a Y" (ou "capítulo X" quando a faixa tem um só). */
export function suggestTitle(number: number, from: number, to: number): string {
  return from === to
    ? `Sessão ${number}: capítulo ${from}`
    : `Sessão ${number}: capítulos ${from} a ${to}`;
}

export const DEFAULT_RANGE_SIZE = 3;

/**
 * Faixa padrão da próxima sessão: do capítulo seguinte ao fim da última sessão do livro (rascunhos
 * incluídos) até +2, limitada ao total. `null` quando já não sobra capítulo.
 */
export function defaultRange(
  lastChapterTo: number | null,
  totalChapters: number,
): { from: number; to: number } | null {
  const from = (lastChapterTo ?? 0) + 1;
  if (from > totalChapters) return null;
  return { from, to: Math.min(from + DEFAULT_RANGE_SIZE - 1, totalChapters) };
}
