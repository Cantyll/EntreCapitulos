import { logFailure } from '@/lib/auth/log';

import {
  TOUR_STORAGE_KEY,
  parseTourStorage,
  serializeTourStorage,
  type TourStorage,
} from './storage';

/*
 * Estado do tutorial na aba (etapa 8k), para `useSyncExternalStore`: a fonte é a memória deste módulo, espelhada no
 * `sessionStorage` (`ec:tour:v1`) para retomar depois de recarregar. No servidor (e na hidratação) é sempre vazio:
 * nada do tour depende do servidor, e não há divergência de hidratação.
 *
 * O armazenamento pode recusar (modo privado, cota, dados do site bloqueados): o tour continua só em memória, e a
 * falha é registrada uma vez por carga de página (só o nome do erro, nunca o valor guardado).
 */

const EMPTY: TourStorage = { v: 1 };

let current: TourStorage | null = null;
const listeners = new Set<() => void>();
let readFailureLogged = false;
let writeFailureLogged = false;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch (error) {
    if (!readFailureLogged) {
      readFailureLogged = true;
      logFailure('tutorial: armazenamento da aba', error);
    }
    return null;
  }
}

function load(): TourStorage {
  const area = storage();
  if (!area) return EMPTY;
  try {
    return parseTourStorage(area.getItem(TOUR_STORAGE_KEY));
  } catch (error) {
    if (!readFailureLogged) {
      readFailureLogged = true;
      logFailure('tutorial: leitura da aba', error);
    }
    return EMPTY;
  }
}

export function subscribeTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTourSnapshot(): TourStorage {
  current ??= load();
  return current;
}

export function getTourServerSnapshot(): TourStorage {
  return EMPTY;
}

export function setTourStorage(next: TourStorage): void {
  current = next;
  const area = storage();
  if (area) {
    try {
      if (next.run === undefined && next.intent === undefined) area.removeItem(TOUR_STORAGE_KEY);
      else area.setItem(TOUR_STORAGE_KEY, serializeTourStorage(next));
    } catch (error) {
      if (!writeFailureLogged) {
        writeFailureLogged = true;
        logFailure('tutorial: gravação da aba', error);
      }
    }
  }
  for (const listener of listeners) listener();
}

export function updateTourStorage(change: (previous: TourStorage) => TourStorage): void {
  setTourStorage(change(getTourSnapshot()));
}
