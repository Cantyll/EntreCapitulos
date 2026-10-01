/*
 * Regras do filtro de spoiler, puras. "Progresso" é o último capítulo que a pessoa leu DO LIVRO:
 * 0 = ainda não comecei, `total_chapters` = li tudo.
 *
 * O filtro é uma cortesia de leitura, não uma trava de segurança: o texto coberto continua no HTML
 * (com `inert`, `aria-hidden` e blur). Título da sessão, resumo e números de capítulo aparecem sempre.
 */

/**
 * Sem progresso conhecido (nenhum cookie, nenhuma linha no banco) a página trata como "não comecei"
 * e pergunta até onde a pessoa leu. É a constante que muda se um dia isso parecer hostil.
 */
export const UNKNOWN_PROGRESS = 0;

export const PROGRESS_PROMPT = 'Até que capítulo você leu?';

/** O valor usado nas regras: o conhecido, ou `UNKNOWN_PROGRESS`. */
export function effectiveProgress(known: number | null): number {
  return known ?? UNKNOWN_PROGRESS;
}

/**
 * O capítulo N de uma sessão fica coberto se N > progresso. A abertura (o que vem antes da primeira
 * divisória) não é capítulo e nunca é coberta: quem chama simplesmente não passa por aqui.
 */
export function isChapterCovered(chapter: number, progress: number): boolean {
  return chapter > progress;
}

/** "Trechos e anotações" e "Perguntas para a discussão": cobertos enquanto progresso < `chapter_to`. */
export function isExtrasCovered(progress: number, chapterTo: number): boolean {
  return progress < chapterTo;
}

/** "Anotações na margem" da página do livro: só as de sessões que a pessoa já terminou de ler. */
export function isMarginNoteVisible(progress: number, chapterTo: number): boolean {
  return chapterTo <= progress;
}

/** Limite do capítulo no banco (`reading_progress.chapter` não tem teto, o livro tem `total`). */
export const PROGRESS_MAX = 1000;

/**
 * Valida um progresso vindo do cliente: inteiro de 0 a `total_chapters`. Devolve o número ou
 * `null`. Texto como "3", decimais, NaN, negativos e acima do total são recusados.
 */
export function parseProgress(value: unknown, totalChapters: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > Math.min(totalChapters, PROGRESS_MAX)) return null;
  return value;
}
