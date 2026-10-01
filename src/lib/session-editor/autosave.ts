import { sameToken, snapshotsEqual, type ServerVersion, type SessionSnapshot } from './snapshot';

/*
 * Máquina do salvamento da sessão, sem React nem DOM: o relógio, a rede e o IndexedDB entram por
 * injeção, então tudo aqui roda em teste com relógio falso. O hook só liga isto à tela.
 *
 * Regras:
 *  - Rascunho: salva no servidor ~2 s depois da última alteração (debounce) e na hora quando o app
 *    vai para segundo plano. Sessão PUBLICADA nunca é enviada sozinha (uma frase pela metade iria
 *    ao ar): só por `saveNow()`.
 *  - Toda alteração vai para a cópia local (IndexedDB) na hora, antes de qualquer envio.
 *  - Uma gravação por vez. O token (`updated_at`, texto opaco) só vale se for igual ao do banco; se
 *    outro lugar gravou antes, vem `conflict` e nada mais é enviado até a pessoa escolher.
 *  - Sem rede: o rascunho fica salvo só no aparelho e é reenviado ao voltar a conexão.
 */

export const DEBOUNCE_MS = 2000;
export const RETRY_DELAYS_MS = [2000, 5000, 15_000, 30_000] as const;

export type SaveMode = 'draft' | 'published';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'error' | 'conflict';

export type SaveRequest = {
  sessionId: string | null;
  expectedUpdatedAt: string | null;
  snapshot: SessionSnapshot;
};

export type SaveResult =
  | { kind: 'ok'; updatedAt: string; sessionId: string }
  /** Outro lugar gravou antes: o estado atual do servidor vem junto. */
  | { kind: 'conflict'; server: ServerVersion }
  | { kind: 'not_found' }
  /** O servidor recusou o conteúdo (ex.: capítulos de outra sessão). Não adianta repetir. */
  | { kind: 'rejected'; message: string; revert?: Partial<SessionSnapshot> }
  | { kind: 'network' }
  | { kind: 'failed'; message?: string };

export type LocalRecord = {
  /** Token do servidor em que a edição se baseou (`null` = sessão ainda não criada). */
  baseUpdatedAt: string | null;
  snapshot: SessionSnapshot;
  /** `true` enquanto há alterações que o servidor ainda não recebeu. */
  dirty: boolean;
};

export type LocalStore = {
  write(record: LocalRecord): Promise<void>;
  remove(): Promise<void>;
};

export type Scheduler = {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

export type EditorState = {
  mode: SaveMode;
  status: SaveStatus;
  current: SessionSnapshot;
  saved: SessionSnapshot;
  token: string | null;
  sessionId: string | null;
  online: boolean;
  dirty: boolean;
  conflict: ServerVersion | null;
  /** Mensagem do servidor (recusa) ou aviso; `null` quando não há. */
  message: string | null;
  /** Sobe sempre que o controlador troca o conteúdo por fora (restaurar, carregar, descartar). */
  loadRevision: number;
};

export type AutosaveDeps = {
  initial: { snapshot: SessionSnapshot; token: string | null; sessionId: string | null };
  mode: SaveMode;
  transport: (request: SaveRequest) => Promise<SaveResult>;
  local: LocalStore;
  scheduler: Scheduler;
  online?: boolean;
  debounceMs?: number;
  /** Sessão ainda não criada só vira linha no banco quando isto diz que vale a pena. */
  worthCreating?: (snapshot: SessionSnapshot) => boolean;
  onSessionCreated?: (sessionId: string) => void;
};

export class AutosaveController {
  private state: EditorState;
  private listeners = new Set<(state: EditorState) => void>();
  private timer: unknown = null;
  private retryTimer: unknown = null;
  private retryCount = 0;
  private inFlight = false;
  private inFlightPromise: Promise<void> | null = null;
  private flushAfterFlight = false;
  private localWriting = false;
  private localPending: LocalRecord | 'remove' | null = null;

  constructor(private readonly deps: AutosaveDeps) {
    this.state = {
      mode: deps.mode,
      status: 'idle',
      current: deps.initial.snapshot,
      saved: deps.initial.snapshot,
      token: deps.initial.token,
      sessionId: deps.initial.sessionId,
      online: deps.online ?? true,
      dirty: false,
      conflict: null,
      message: null,
      loadRevision: 0,
    };
  }

  getState = (): EditorState => this.state;

  subscribe = (listener: (state: EditorState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  /** Alterações que o servidor ainda não tem (para o aviso ao fechar). */
  hasUnsentChanges(): boolean {
    return this.state.dirty || this.inFlight;
  }

  // --- Alterações ---------------------------------------------------------------------------

  edit(snapshot: SessionSnapshot): void {
    if (snapshotsEqual(snapshot, this.state.current)) return;
    const dirty = !snapshotsEqual(snapshot, this.state.saved);
    this.set({
      current: snapshot,
      dirty,
      message: null,
      status: this.statusAfterEdit(dirty),
    });
    if (dirty) this.writeLocal();
    else this.removeLocal();
    if (this.state.status !== 'conflict') this.scheduleSave();
  }

  /** Muda a política depois de publicar ou voltar para rascunho. */
  setMode(mode: SaveMode): void {
    if (mode === this.state.mode) return;
    this.set({ mode });
    if (mode === 'draft') this.scheduleSave();
    else this.cancelTimers();
  }

  private statusAfterEdit(dirty: boolean): SaveStatus {
    const { status } = this.state;
    if (status === 'conflict') return 'conflict';
    // Sem rede o aviso "salvo só neste aparelho" continua valendo enquanto a pessoa digita.
    if (dirty && (status === 'offline' || !this.state.online)) return 'offline';
    return dirty ? 'dirty' : this.cleanStatus();
  }

  private cleanStatus(): SaveStatus {
    return this.state.token === null && this.state.sessionId === null ? 'idle' : 'saved';
  }

  // --- Envio ----------------------------------------------------------------------------------

  private scheduleSave(): void {
    this.clearTimer();
    if (this.state.mode !== 'draft' || !this.state.dirty) return;
    this.timer = this.deps.scheduler.set(() => {
      this.timer = null;
      void this.send();
    }, this.deps.debounceMs ?? DEBOUNCE_MS);
  }

  /** Envio imediato (app indo para segundo plano, mudança de faixa…). No rascunho apenas. */
  flush(): Promise<void> {
    if (this.state.mode !== 'draft') return Promise.resolve();
    this.clearTimer();
    return this.send();
  }

  /** O app foi para segundo plano: grava a cópia local e envia o rascunho agora. */
  onBackground(): Promise<void> {
    if (this.state.dirty) this.writeLocal();
    return this.flush();
  }

  /** Botão "Salvar alterações" (sessão publicada) ou "Tentar de novo". Funciona em qualquer modo. */
  saveNow(): Promise<void> {
    this.clearTimer();
    return this.send();
  }

  private async send(): Promise<void> {
    const { state } = this;
    if (!state.dirty || state.status === 'conflict') return;
    if (this.inFlight) {
      this.flushAfterFlight = true;
      await this.inFlightPromise;
      return;
    }
    if (state.sessionId === null && !(this.deps.worthCreating?.(state.current) ?? true)) return;
    if (!state.online) {
      this.set({ status: 'offline' });
      return;
    }

    const sent = state.current;
    this.inFlight = true;
    this.clearRetry();
    this.set({ status: 'saving', message: null });

    this.inFlightPromise = (async () => {
      let result: SaveResult;
      try {
        result = await this.deps.transport({
          sessionId: state.sessionId,
          expectedUpdatedAt: state.token,
          snapshot: sent,
        });
      } catch {
        result = { kind: 'network' };
      }
      this.inFlight = false;
      this.apply(result, sent);

      if (this.flushAfterFlight) {
        this.flushAfterFlight = false;
        if (this.state.dirty && this.state.status !== 'conflict' && this.state.mode === 'draft') {
          await this.send();
        }
      }
    })();
    await this.inFlightPromise;
  }

  /** Espera terminar o envio em andamento (e o reenvio que ele puxou). Usado antes de publicar. */
  async idle(): Promise<void> {
    while (this.inFlight) await this.inFlightPromise;
  }

  private apply(result: SaveResult, sent: SessionSnapshot): void {
    switch (result.kind) {
      case 'ok': {
        this.retryCount = 0;
        const created = this.state.sessionId === null;
        const stillDirty = !snapshotsEqual(this.state.current, sent);
        this.set({
          token: result.updatedAt,
          sessionId: result.sessionId,
          saved: sent,
          dirty: stillDirty,
          status: stillDirty ? 'dirty' : 'saved',
          message: null,
        });
        if (created) this.deps.onSessionCreated?.(result.sessionId);
        if (stillDirty) {
          this.writeLocal();
          this.scheduleSave();
        } else this.removeLocal();
        return;
      }
      case 'conflict':
        this.cancelTimers();
        this.set({ status: 'conflict', conflict: result.server, message: null });
        return;
      case 'not_found':
        this.cancelTimers();
        this.set({
          status: 'error',
          message: 'Esta sessão não existe mais. Copie o que escreveu antes de sair.',
        });
        return;
      case 'rejected': {
        const current = result.revert
          ? { ...this.state.current, ...result.revert }
          : this.state.current;
        const dirty = !snapshotsEqual(current, this.state.saved);
        this.set({
          current,
          dirty,
          status: 'error',
          message: result.message,
          // O editor precisa mostrar o valor de volta (ex.: a faixa de capítulos).
          loadRevision: result.revert ? this.state.loadRevision + 1 : this.state.loadRevision,
        });
        if (dirty) this.writeLocal();
        else this.removeLocal();
        // Só as mudanças que sobraram (sem a recusada) seguem para o servidor.
        if (result.revert && dirty) this.scheduleSave();
        return;
      }
      case 'network':
        this.set({ status: 'offline', message: null });
        this.scheduleRetry();
        return;
      case 'failed':
        this.set({ status: 'error', message: result.message ?? null });
        this.scheduleRetry();
        return;
    }
  }

  private scheduleRetry(): void {
    if (this.state.mode !== 'draft') return;
    this.clearRetry();
    const delay = RETRY_DELAYS_MS[Math.min(this.retryCount, RETRY_DELAYS_MS.length - 1)]!;
    this.retryCount += 1;
    this.retryTimer = this.deps.scheduler.set(() => {
      this.retryTimer = null;
      void this.send();
    }, delay);
  }

  /** `online`/`offline` do navegador. Ao voltar a conexão, reenvia na hora (rascunho). */
  setOnline(online: boolean): void {
    if (online === this.state.online) return;
    this.set({ online });
    if (!online) {
      if (this.state.dirty && this.state.status !== 'conflict') this.set({ status: 'offline' });
      return;
    }
    this.retryCount = 0;
    this.clearRetry();
    if (this.state.dirty && this.state.mode === 'draft') void this.send();
    else if (this.state.status === 'offline') {
      this.set({ status: this.state.dirty ? 'dirty' : this.cleanStatus() });
    }
  }

  // --- Conflito, restauração e descarte ----------------------------------------------------

  /** "Carregar a versão do servidor": troca o conteúdo e apaga a cópia local. */
  acceptServerVersion(): void {
    const server = this.state.conflict;
    if (!server) return;
    this.cancelTimers();
    this.set({
      current: server.snapshot,
      saved: server.snapshot,
      token: server.updatedAt,
      dirty: false,
      conflict: null,
      status: 'saved',
      message: null,
      loadRevision: this.state.loadRevision + 1,
    });
    this.removeLocal();
  }

  /** "Sobrescrever com a minha": adota o token do servidor e envia o que está na tela. */
  overwriteWithMine(): Promise<void> {
    const server = this.state.conflict;
    if (!server) return Promise.resolve();
    this.set({
      token: server.updatedAt,
      saved: server.snapshot,
      conflict: null,
      dirty: !snapshotsEqual(this.state.current, server.snapshot),
      status: 'dirty',
    });
    return this.send();
  }

  /**
   * Restaura a cópia local. O token volta a ser o da BASE da cópia: se o servidor mudou desde
   * então, o primeiro envio dá conflito e a pessoa escolhe, em vez de sobrescrever às cegas.
   */
  restoreLocal(record: LocalRecord): void {
    this.cancelTimers();
    this.set({
      current: record.snapshot,
      token: record.baseUpdatedAt ?? this.state.token,
      dirty: !snapshotsEqual(record.snapshot, this.state.saved),
      status: 'dirty',
      message: null,
      loadRevision: this.state.loadRevision + 1,
    });
    this.writeLocal();
    this.scheduleSave();
  }

  /** "Descartar alterações": volta ao que está no servidor. */
  discard(): void {
    this.cancelTimers();
    this.set({
      current: this.state.saved,
      dirty: false,
      status: this.cleanStatus(),
      message: null,
      loadRevision: this.state.loadRevision + 1,
    });
    this.removeLocal();
  }

  // --- Cópia local ----------------------------------------------------------------------------

  private writeLocal(): void {
    this.enqueueLocal({
      baseUpdatedAt: this.state.token,
      snapshot: this.state.current,
      dirty: true,
    });
  }

  private removeLocal(): void {
    this.enqueueLocal('remove');
  }

  /** Uma gravação local por vez; a última pedida vence. Falha de IndexedDB nunca derruba o editor. */
  private enqueueLocal(item: LocalRecord | 'remove'): void {
    this.localPending = item;
    if (this.localWriting) return;
    this.localWriting = true;
    void (async () => {
      while (this.localPending) {
        const next = this.localPending;
        this.localPending = null;
        try {
          if (next === 'remove') await this.deps.local.remove();
          else await this.deps.local.write(next);
        } catch {
          // IndexedDB indisponível (modo privado, cota): o envio ao servidor continua valendo.
        }
      }
      this.localWriting = false;
    })();
  }

  // --- Timers ---------------------------------------------------------------------------------

  private clearTimer(): void {
    if (this.timer !== null) this.deps.scheduler.clear(this.timer);
    this.timer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) this.deps.scheduler.clear(this.retryTimer);
    this.retryTimer = null;
  }

  private cancelTimers(): void {
    this.clearTimer();
    this.clearRetry();
  }

  dispose(): void {
    this.cancelTimers();
    this.listeners.clear();
  }
}

// --- Abrir a página com uma cópia local ------------------------------------------------------

export type RestoreDecision =
  | { kind: 'none' }
  /** `serverChanged`: o servidor mudou depois da base da cópia (o aviso fica mais forte). */
  | { kind: 'ask'; serverChanged: boolean };

/**
 * Pergunta "Restaurar?" só quando a cópia tem alterações não enviadas E o conteúdo difere do
 * servidor. "Mais nova" é decidido pela marca `dirty` (não por relógio do aparelho, que erra).
 */
export function decideRestore(server: ServerVersion, local: LocalRecord | null): RestoreDecision {
  if (!local || !local.dirty) return { kind: 'none' };
  if (snapshotsEqual(local.snapshot, server.snapshot)) return { kind: 'none' };
  return { kind: 'ask', serverChanged: !sameToken(local.baseUpdatedAt, server.updatedAt) };
}

// --- Texto do indicador ----------------------------------------------------------------------

export function statusLabel(state: Pick<EditorState, 'status' | 'mode' | 'dirty'>): string {
  const draft = state.mode === 'draft';
  switch (state.status) {
    case 'saving':
      return 'Salvando…';
    case 'offline':
      return 'Sem conexão: salvo só neste aparelho';
    case 'error':
      return 'Erro ao salvar';
    case 'conflict':
      return 'Conflito: a sessão mudou em outro lugar';
    case 'dirty':
      return draft ? 'Alterações ainda não enviadas' : 'Alterações não salvas';
    case 'saved':
      return draft ? 'Rascunho salvo' : 'Salvo';
    case 'idle':
      return draft ? 'Rascunho novo' : '';
  }
}
