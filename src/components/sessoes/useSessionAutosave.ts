'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { saveSessionAction } from '@/app/painel/sessoes/actions';
import { newSessionHref } from '@/lib/routes';
import { isBodyEmpty } from '@/lib/session-body';
import {
  AutosaveController,
  decideRestore,
  type EditorState,
  type LocalRecord,
  type SaveMode,
  type SaveRequest,
  type SaveResult,
} from '@/lib/session-editor/autosave';
import {
  IndexedDbStore,
  newSessionKey,
  readLocal,
  sessionKey,
} from '@/lib/session-editor/local-store';
import { snapshotsEqual, type SessionSnapshot } from '@/lib/session-editor/snapshot';

/*
 * Cola entre o controlador do autosave (puro, com testes) e a tela: liga o transporte à Server
 * Action, o IndexedDB, os eventos do navegador (segundo plano, conexão, fechar a aba) e a pergunta
 * "Restaurar?". Não tem regra própria: se algo aqui parecer lógica, ela pertence ao controlador.
 */

export type RestorePrompt = { record: LocalRecord; serverChanged: boolean };

type Options = {
  bookId: string;
  sessionId: string | null;
  token: string | null;
  snapshot: SessionSnapshot;
  mode: SaveMode;
  onCreated: (sessionId: string, number: number) => void;
};

function isNetworkFailure(error: unknown): boolean {
  return (
    (typeof navigator !== 'undefined' && navigator.onLine === false) || error instanceof TypeError
  );
}

/** Um conteúdo só vale a pena criar (linha no banco) se tiver título ou texto. */
export const worthCreating = (snapshot: SessionSnapshot): boolean =>
  snapshot.title.trim() !== '' || !isBodyEmpty(snapshot.body);

export function useSessionAutosave(options: Options) {
  const onCreatedRef = useRef(options.onCreated);
  useEffect(() => {
    onCreatedRef.current = options.onCreated;
  }, [options.onCreated]);

  const [{ controller, store }] = useState(() => {
    const store = new IndexedDbStore(
      options.sessionId ? sessionKey(options.sessionId) : newSessionKey(options.bookId),
    );

    const transport = async (request: SaveRequest): Promise<SaveResult> => {
      try {
        const out = await saveSessionAction({
          sessionId: request.sessionId,
          expectedUpdatedAt: request.expectedUpdatedAt,
          // JSON puro: o que vem do editor pode ter objetos sem protótipo, que a Server Action recusa.
          fields: JSON.parse(JSON.stringify(request.snapshot)) as typeof request.snapshot,
        });
        switch (out.kind) {
          case 'ok': {
            if (request.sessionId === null) {
              // A sessão virou linha no banco: a cópia local muda de chave e a URL ganha o id do
              // rascunho. Continua na MESMA página (/nova, com ?sessao=<id>) de propósito: o Next
              // refaz a página atual depois de uma ação que expira cache (trecho, pergunta…), e se
              // a URL já fosse a de OUTRA rota (/<id>) ele montaria o editor de novo, com o texto
              // do servidor, e o que ainda não foi enviado sumiria (e o teclado fecharia no iPhone).
              await store.remove().catch(() => {});
              store.rekey(sessionKey(out.sessionId));
              window.history.replaceState(null, '', newSessionHref(out.sessionId));
              onCreatedRef.current(out.sessionId, out.number);
            }
            return { kind: 'ok', updatedAt: out.updatedAt, sessionId: out.sessionId };
          }
          case 'conflict':
            return { kind: 'conflict', server: out.server };
          case 'not_found':
            return { kind: 'not_found' };
          case 'rejected':
            return { kind: 'rejected', message: out.message, revert: out.revert };
          case 'failed':
            return { kind: 'failed', message: out.message };
        }
      } catch (error) {
        return isNetworkFailure(error) ? { kind: 'network' } : { kind: 'failed' };
      }
    };

    const controller = new AutosaveController({
      initial: {
        snapshot: options.snapshot,
        token: options.token,
        sessionId: options.sessionId,
      },
      mode: options.mode,
      transport,
      local: store,
      scheduler: {
        set: (callback, ms) => window.setTimeout(callback, ms),
        clear: (handle) => window.clearTimeout(handle as number),
      },
      worthCreating,
    });
    return { controller, store };
  });

  const state = useSyncExternalStore<EditorState>(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  // Até a leitura da cópia local terminar, o editor fica só para leitura: uma digitação antes disso
  // sobrescreveria a cópia que a pessoa ainda vai decidir se restaura.
  const [ready, setReady] = useState(false);
  const [prompt, setPrompt] = useState<RestorePrompt | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const record = await readLocal(store.key);
      if (cancelled) return;
      const initial = controller.getState();
      if (initial.sessionId === null) {
        // Sessão que nunca chegou ao servidor: a cópia só importa se tiver o que salvar.
        if (record?.dirty && worthCreating(record.snapshot)) {
          setPrompt({ record, serverChanged: false });
        } else if (record) await store.remove().catch(() => {});
      } else {
        const decision = decideRestore(
          { updatedAt: initial.token ?? '', snapshot: initial.saved },
          record,
        );
        if (decision.kind === 'ask' && record) {
          setPrompt({ record, serverChanged: decision.serverChanged });
        } else if (record && !snapshotsEqual(record.snapshot, initial.saved)) {
          // Cópia antiga sem alterações pendentes: não serve para nada.
          await store.remove().catch(() => {});
        } else if (record) await store.remove().catch(() => {});
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [controller, store]);

  // Eventos do navegador.
  useEffect(() => {
    controller.setOnline(navigator.onLine);
    const background = () => {
      if (document.visibilityState === 'hidden') void controller.onBackground();
    };
    const pagehide = () => void controller.onBackground();
    const online = () => controller.setOnline(true);
    const offline = () => controller.setOnline(false);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!controller.hasUnsentChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('visibilitychange', background);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', background);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('beforeunload', beforeUnload);
      // Saiu da página por um link do app: manda o que faltar.
      void controller.flush();
    };
  }, [controller]);

  const acceptRestore = useCallback(() => {
    if (!prompt) return;
    controller.restoreLocal(prompt.record);
    setPrompt(null);
  }, [controller, prompt]);

  const declineRestore = useCallback(() => {
    setPrompt(null);
    void store.remove().catch(() => {});
  }, [store]);

  return { controller, store, state, ready, prompt, acceptRestore, declineRestore };
}
