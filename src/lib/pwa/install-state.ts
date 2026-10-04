import { INSTALL_RULES } from '@/content/install';

import type { InstallEligibility } from './platform';

/*
 * Quando mostrar o cartão de instalação (etapa 8e). Funções PURAS (o armazenamento, a data e o aparelho entram
 * por parâmetro) e testadas. As regras e os números estão em `src/content/install.ts`.
 *
 * O estado é uma PREFERÊNCIA DO APARELHO no localStorage, nunca enviada ao servidor e sem dado pessoal:
 * `{ visits, lastDay, dismissedAt, never }`. Quem lê aqui valida tudo de forma estrita: qualquer coisa fora do
 * formato (JSON quebrado, campo a mais, tipo errado) é ignorada e o estado volta ao zero; como o estado volta ao zero,
 * a visita do dia é contada e REGRAVA o valor: um texto quebrado se conserta sozinho na carga seguinte. Se o navegador
 * recusar o armazenamento (modo com cookies bloqueados), nada é gravado e o cartão fica escondido no site público
 * (sem contagem não há "2ª visita"). Os `catch` daqui NÃO engolem o erro: devolvem-no a quem chamou (o
 * `InstallGate`), que o registra UMA vez por carga de página com `logFailure`, só com o nome do erro (nunca a chave
 * nem o valor).
 */

export type InstallState = {
  /** Dias distintos (calendário local) em que a pessoa abriu o site neste aparelho. */
  visits: number;
  /** O último dia contado, `AAAA-MM-DD` no calendário LOCAL do aparelho. */
  lastDay: string | null;
  /** Quando tocou em "Agora não" (milissegundos desde 1970), ou null. */
  dismissedAt: number | null;
  /** "Já instalei": nunca mais mostrar. */
  never: boolean;
};

export const EMPTY_INSTALL_STATE: InstallState = {
  visits: 0,
  lastDay: null,
  dismissedAt: null,
  never: false,
};

/** Onde o cartão está sendo decidido. O painel mostra desde o primeiro acesso; o site público, a partir da 2ª visita. */
export type InstallSurface = 'public' | 'panel';

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_VISITS = 1_000_000;
const MS_PER_DAY = 86_400_000;
const STATE_KEYS = ['v', 'visits', 'lastDay', 'dismissedAt', 'never'];

function isRealDay(value: string): boolean {
  const match = DAY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export type ParseResult = {
  state: InstallState;
  /** O erro do `JSON.parse` (texto quebrado), para quem chamou registrar o NOME. Formato errado não é erro: só volta ao zero. */
  error: unknown;
  failed: boolean;
};

/** Lê o texto guardado. Qualquer coisa fora do formato exato vira o estado vazio (nunca lança). */
export function parseInstallStateDetailed(raw: string | null | undefined): ParseResult {
  const empty: ParseResult = { state: EMPTY_INSTALL_STATE, error: undefined, failed: false };
  if (typeof raw !== 'string' || raw === '') return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // Quem chama registra só o nome do erro (nunca o texto lido) e o estado volta ao zero.
    return { state: EMPTY_INSTALL_STATE, error, failed: true };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return empty;
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== STATE_KEYS.length || !STATE_KEYS.every((key) => keys.includes(key))) {
    return empty;
  }
  const { v, visits, lastDay, dismissedAt, never } = record;
  if (v !== 1) return empty;
  if (
    typeof visits !== 'number' ||
    !Number.isInteger(visits) ||
    visits < 0 ||
    visits > MAX_VISITS
  ) {
    return empty;
  }
  if (lastDay !== null && (typeof lastDay !== 'string' || !isRealDay(lastDay))) return empty;
  if (
    dismissedAt !== null &&
    (typeof dismissedAt !== 'number' || !Number.isSafeInteger(dismissedAt) || dismissedAt < 0)
  ) {
    return empty;
  }
  if (typeof never !== 'boolean') return empty;
  return { state: { visits, lastDay, dismissedAt, never }, error: undefined, failed: false };
}

/** Como `parseInstallStateDetailed`, só o estado. */
export function parseInstallState(raw: string | null | undefined): InstallState {
  return parseInstallStateDetailed(raw).state;
}

export function serializeInstallState(state: InstallState): string {
  return JSON.stringify({
    v: 1,
    visits: state.visits,
    lastDay: state.lastDay,
    dismissedAt: state.dismissedAt,
    never: state.never,
  });
}

/** O dia do calendário LOCAL do aparelho, `AAAA-MM-DD` (recarregar a página no mesmo dia não conta visita). */
export function localDay(date: Date): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A rota é uma das excluídas (igual ou subcaminho)? Ignora `?consulta`, `#âncora` e a barra final. */
export function isExcludedPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  return INSTALL_RULES.excludedPaths.some(
    (excluded) => path === excluded || path.startsWith(`${excluded}/`),
  );
}

/** `?instalacao=ver`: mostra o cartão ignorando contagem e dispensa (para testar sem esperar dois dias). */
export function isPreviewRequest(search: string): boolean {
  return new URLSearchParams(search).get(INSTALL_RULES.previewParam) === INSTALL_RULES.previewValue;
}

/** A dispensa ("Agora não") ainda vale? Um `dismissedAt` no futuro (relógio do aparelho voltou) é ignorado. */
export function isDismissed(state: InstallState, now: Date): boolean {
  if (state.never) return true;
  if (state.dismissedAt === null) return false;
  const elapsed = now.getTime() - state.dismissedAt;
  return elapsed >= 0 && elapsed < INSTALL_RULES.dismissDays * MS_PER_DAY;
}

export type InstallView = 'card' | 'hint';

export type InstallDecision = {
  /** O que mostrar agora, ou nada. */
  view: InstallView | null;
  /** O estado depois de contar esta visita. */
  state: InstallState;
  /** Há algo novo para gravar? */
  persist: boolean;
};

export type DecideInput = {
  eligibility: InstallEligibility;
  surface: InstallSurface;
  pathname: string;
  /** `?instalacao=ver`. */
  preview: boolean;
  now: Date;
  state: InstallState;
};

/**
 * Decide o que mostrar e conta a visita do dia. Regras:
 *  - aparelho que não é elegível (desktop, Android, app instalado, outros navegadores do iOS): nada, e a visita nem é contada;
 *  - uma visita = um dia do calendário local, no máximo +1 por dia (recarregar não conta);
 *  - "Já instalei" (`never`) e "Agora não" (60 dias) escondem;
 *  - site público: a partir da 2ª visita; painel: desde o primeiro acesso;
 *  - rotas excluídas: a visita conta, mas nada aparece;
 *  - pré-visualização (`?instalacao=ver`, só o cartão do Safari): ignora contagem e dispensa e NÃO grava nada
 *    (a rota excluída continua valendo).
 */
export function decide(input: DecideInput): InstallDecision {
  const { eligibility, surface, pathname, preview, now, state } = input;
  const idle: InstallDecision = { view: null, state, persist: false };
  if (eligibility === 'none') return idle;

  const view: InstallView = eligibility === 'card' ? 'card' : 'hint';
  const excluded = isExcludedPath(pathname);

  // A pré-visualização é só do cartão do Safari (a dica do navegador embutido segue as regras normais).
  if (preview && eligibility === 'card') {
    return { view: excluded ? null : view, state, persist: false };
  }

  const today = localDay(now);
  const counted: InstallState =
    state.lastDay === today
      ? state
      : { ...state, visits: Math.min(state.visits + 1, MAX_VISITS), lastDay: today };
  const persist = counted !== state;

  if (excluded || isDismissed(counted, now)) return { view: null, state: counted, persist };
  const needed = surface === 'public' ? INSTALL_RULES.minVisitsPublic : 1;
  return { view: counted.visits >= needed ? view : null, state: counted, persist };
}

/** "Agora não": esconde por `dismissDays` dias. */
export function dismissLater(state: InstallState, now: Date): InstallState {
  return { ...state, dismissedAt: now.getTime() };
}

/** "Já instalei": nunca mais mostrar. */
export function dismissForever(state: InstallState): InstallState {
  return { ...state, never: true };
}

/** Só o que o código usa do `localStorage`: dá para testar com um objeto de mentira. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export type LoadResult = {
  state: InstallState;
  /** O erro do navegador ou do `JSON.parse` (o nome e o construtor viram o registro; a chave e o valor nunca). */
  error: unknown;
  /** Houve um erro para registrar (armazenamento recusado ou texto guardado quebrado). */
  failed: boolean;
  /**
   * Dá para gravar? Falso só quando o navegador recusou o armazenamento. Um texto quebrado NÃO impede: o estado volta
   * ao zero e a próxima gravação o conserta.
   */
  writable: boolean;
};

/**
 * Lê o estado do armazenamento. Se o armazenamento recusa, devolve o estado vazio, o erro e `writable: false`; se o
 * texto guardado está quebrado, devolve o estado vazio e o erro, mas `writable: true` (a gravação o conserta).
 */
export function loadInstallState(getStorage: () => StorageLike | null): LoadResult {
  let raw: string | null;
  try {
    const storage = getStorage();
    if (!storage) {
      return { state: EMPTY_INSTALL_STATE, error: undefined, failed: false, writable: true };
    }
    raw = storage.getItem(INSTALL_RULES.storageKey);
  } catch (error) {
    // Quem chama registra o erro (só o nome) uma vez por carga de página; aqui o estado volta ao zero.
    return { state: EMPTY_INSTALL_STATE, error, failed: true, writable: false };
  }
  return { ...parseInstallStateDetailed(raw), writable: true };
}

export type SaveResult = { error: unknown; failed: boolean };

/** Grava o estado. Nunca lança: devolve o erro para quem chamou registrar. */
export function saveInstallState(
  getStorage: () => StorageLike | null,
  state: InstallState,
): SaveResult {
  try {
    const storage = getStorage();
    if (!storage) return { error: undefined, failed: false };
    storage.setItem(INSTALL_RULES.storageKey, serializeInstallState(state));
    return { error: undefined, failed: false };
  } catch (error) {
    return { error, failed: true };
  }
}
