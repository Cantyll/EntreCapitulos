import type { ChapterId } from '@/content/tour/steps';

/*
 * `/painel?tutorial=conta` (etapa 8k): o link "Ver o tutorial desta parte" de Minha conta (só para a equipe) abre o
 * capítulo "Conta e instalação" no painel.
 *
 *  - O valor é conferido contra uma lista FIXA; qualquer outro é ignorado, sem erro.
 *  - O parâmetro sozinho não inicia nada: o clique no link grava uma intenção de uso único (com hora) no
 *    armazenamento da aba, e o painel só começa o tour se a intenção existir, for recente e bater com o valor.
 *    Um endereço colado, um favorito ou um link de fora nunca abrem o tour sozinhos.
 *  - O parâmetro sai do endereço depois de lido, válido ou não.
 */

export const TUTORIAL_PARAM = 'tutorial';

const TUTORIAL_VALUES = { conta: 'conta' } as const satisfies Record<string, ChapterId>;

export type TutorialValue = keyof typeof TUTORIAL_VALUES;

/** A intenção vale por pouco tempo: o bastante para a navegação do clique até o painel. */
export const INTENT_MAX_AGE_MS = 60_000;

export type TourIntent = { value: TutorialValue; at: number };

export function parseTutorialParam(value: string | null | undefined): TutorialValue | null {
  if (typeof value !== 'string') return null;
  return Object.hasOwn(TUTORIAL_VALUES, value) ? (value as TutorialValue) : null;
}

export function chapterOfTutorialValue(value: TutorialValue): ChapterId {
  return TUTORIAL_VALUES[value];
}

/** O painel só começa o tour com parâmetro válido + intenção do clique, recente e para o mesmo valor. */
export function intentMatches(
  value: TutorialValue | null,
  intent: TourIntent | null,
  now: number,
): boolean {
  if (value === null || intent === null) return false;
  if (intent.value !== value) return false;
  const age = now - intent.at;
  return age >= 0 && age <= INTENT_MAX_AGE_MS;
}

/** A moderação abre o painel em Comentários (`/painel` a redireciona para lá e o parâmetro se perderia). */
export function tutorialHref(
  value: TutorialValue,
  base: '/painel' | '/painel/comentarios' = '/painel',
): `/painel${string}` {
  return `${base}?${TUTORIAL_PARAM}=${value}`;
}
