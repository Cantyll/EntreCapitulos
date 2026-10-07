import { parseTutorialParam, type TourIntent } from './intent';
import { isValidRun, type TourRun } from './model';

/*
 * Armazenamento da ABA (`sessionStorage`), chave única e versionada `ec:tour:v1` (etapa 8k):
 *  - `run`: onde a pessoa está no tour, para retomar depois de recarregar a página;
 *  - `intent`: o clique no link "Ver o tutorial desta parte" (Minha conta), de uso único.
 * Não é dado importante (o estado que vale fica no banco: `profiles.tour_seen_version`), não vai ao servidor e
 * some ao sair do tour, ao concluir ou ao fechar a aba. Está na tabela de armazenamento local do CLAUDE.md, em
 * `src/content/legal/cookies.ts` e na política de privacidade.
 */

export const TOUR_STORAGE_KEY = 'ec:tour:v1';

export type TourStorage = { v: 1; run?: TourRun; intent?: TourIntent };

const EMPTY: TourStorage = { v: 1 };

function isIntent(value: unknown): value is TourIntent {
  if (typeof value !== 'object' || value === null) return false;
  const intent = value as Record<string, unknown>;
  return (
    Object.keys(intent).sort().join(',') === 'at,value' &&
    parseTutorialParam(intent.value as string) !== null &&
    typeof intent.at === 'number' &&
    Number.isFinite(intent.at)
  );
}

/** Leitura estrita: texto quebrado, campo a mais ou tipo errado voltam ao vazio. */
export function parseTourStorage(raw: string | null): TourStorage {
  if (raw === null) return EMPTY;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (typeof data !== 'object' || data === null) return EMPTY;
  const record = data as Record<string, unknown>;
  if (record.v !== 1) return EMPTY;
  const allowed = new Set(['v', 'run', 'intent']);
  if (Object.keys(record).some((key) => !allowed.has(key))) return EMPTY;
  const result: TourStorage = { v: 1 };
  if (record.run !== undefined) {
    if (!isValidRun(record.run)) return EMPTY;
    result.run = record.run;
  }
  if (record.intent !== undefined) {
    if (!isIntent(record.intent)) return EMPTY;
    result.intent = record.intent;
  }
  return result;
}

export function serializeTourStorage(value: TourStorage): string {
  return JSON.stringify(value);
}
