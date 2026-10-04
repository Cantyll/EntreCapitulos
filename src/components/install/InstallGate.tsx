'use client';

import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { Container } from '@/components/ui/Container';
import { INSTALL_RULES } from '@/content/install';
import { logFailure } from '@/lib/auth/log';
import { evaluateInstall } from '@/lib/pwa/install-client';
import {
  dismissForever,
  dismissLater,
  saveInstallState,
  type InstallState,
  type InstallSurface,
} from '@/lib/pwa/install-state';

import { InstallCardBoundary } from './InstallCardBoundary';

// O cartão (SVG e texto) só é baixado quando de fato vai aparecer.
const InstallCard = dynamic(() => import('./InstallCard').then((module) => module.InstallCard), {
  ssr: false,
});

/** Registra cada tipo de falha UMA vez por carga de página (o módulo vive enquanto a página vive). */
const reported = { read: false, write: false, load: false };

// Acessar `window.localStorage` já pode lançar (cookies bloqueados): quem chama está dentro de um try/catch.
const getStorage = () => window.localStorage;

/** Grava o estado; se o navegador recusar, registra UMA vez (só o nome do erro, nunca a chave nem o valor). */
function saveOnce(state: InstallState): boolean {
  const { failed, error } = saveInstallState(getStorage, state);
  if (failed && !reported.write) {
    reported.write = true;
    logFailure('cartão de instalação: gravação', error);
  }
  return !failed;
}

/** O código do cartão não carregou: o cartão some (ver `InstallCardBoundary`) e o erro é registrado UMA vez, só o nome. */
function reportLoadFailure(error: unknown) {
  if (!reported.load) {
    reported.load = true;
    logFailure('cartão de instalação: carregamento', error);
  }
}

// `true` só no navegador, depois da hidratação: no servidor e na hidratação o cartão nunca existe (sem divergência).
const subscribeNever = () => () => {};
const getClient = () => true;
const getServer = () => false;

// Página de erro ou 404 (marcada com `NoInstallCard`): o cartão some, mesmo se ela surgir depois da montagem.
const MARKER = `[${INSTALL_RULES.suppressAttribute}]`;
function subscribeMarker(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.getElementById('conteudo') ?? document.body, {
    childList: true,
    subtree: true,
  });
  return () => observer.disconnect();
}
const getMarker = () => document.querySelector(MARKER) !== null;

type Props = {
  /** O painel mostra desde o primeiro acesso; o site público, a partir da 2ª visita. */
  surface: InstallSurface;
};

/**
 * Decide, só no navegador e depois da hidratação, se mostra o cartão de instalação (ou a dica "abra no Safari"). O
 * servidor nunca renderiza o cartão (não decide nada pelo agente de usuário), então não há divergência de
 * hidratação. A decisão é de `evaluateInstall`/`decide` (src/lib/pwa); as regras, em src/content/install.ts.
 *
 * O estado fica no localStorage, só neste aparelho, e nunca vai ao servidor. Se o armazenamento falhar, o erro é
 * registrado uma vez com `logFailure` (só o nome do erro: nunca a chave nem o valor).
 */
function InstallGateInner({ surface }: Props) {
  const pathname = usePathname();
  // A busca vem do roteador, no mesmo instante que o `pathname` (`window.location` só muda depois da renderização).
  const search = useSearchParams().toString();
  const isClient = useSyncExternalStore(subscribeNever, getClient, getServer);
  const suppressed = useSyncExternalStore(subscribeMarker, getMarker, getServer);
  const [hiddenAt, setHiddenAt] = useState<string | null>(null);

  const evaluation = useMemo(
    () =>
      isClient
        ? evaluateInstall(window, surface, pathname, new Date(), search === '' ? '' : `?${search}`)
        : null,
    [isClient, surface, pathname, search],
  );

  // Grava a visita contada (uma por dia) e registra uma falha de leitura. Só escreve fora; não muda estado.
  useEffect(() => {
    if (!evaluation) return;
    if (evaluation.loadFailed && !reported.read) {
      reported.read = true;
      const { loadError: error } = evaluation;
      logFailure('cartão de instalação: leitura', error);
    }
    // Armazenamento recusado: nada é gravado. Texto quebrado: o estado volta ao zero e esta gravação o conserta.
    if (evaluation.canSave && evaluation.decision.persist && !evaluation.preview) {
      saveOnce(evaluation.decision.state);
    }
  }, [evaluation]);

  const dismiss = useCallback(
    (next: (state: InstallState) => InstallState) => {
      if (!evaluation) return;
      // Na pré-visualização nada é gravado; com o armazenamento quebrado, a dispensa vale só nesta página.
      if (!evaluation.preview && evaluation.canSave) {
        saveOnce(next(evaluation.decision.state));
      }
      setHiddenAt(`${surface}:${pathname}`);
    },
    [evaluation, surface, pathname],
  );

  if (!evaluation?.decision.view || suppressed || hiddenAt === `${surface}:${pathname}`)
    return null;
  const card = (
    <InstallCardBoundary onError={reportLoadFailure}>
      <InstallCard
        view={evaluation.decision.view}
        surface={surface}
        onLater={() => dismiss((state) => dismissLater(state, new Date()))}
        onInstalled={() => dismiss(dismissForever)}
      />
    </InstallCardBoundary>
  );
  // No site público o cartão fica na coluna do conteúdo (a página dele não o envolve num contêiner).
  return surface === 'public' ? <Container>{card}</Container> : card;
}

/**
 * `useSearchParams()` exige um `Suspense` quando a página é pré-renderizada no build (o Next recusa o build sem ele).
 * O servidor nunca renderiza o cartão, então o `fallback` nulo é idêntico ao que a decisão devolve antes da hidratação.
 */
export function InstallGate(props: Props) {
  return (
    <Suspense fallback={null}>
      <InstallGateInner {...props} />
    </Suspense>
  );
}
