'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';

import { markTourSeenAction } from '@/app/painel/tour-actions';
import type { TourRole } from '@/content/tour/steps';
import { TOUR_VERSION } from '@/content/tour/version';
import { isIosSafariOutsideApp, detectPlatform } from '@/lib/pwa/platform';
import {
  TUTORIAL_PARAM,
  buildRun,
  chapterOfTutorialValue,
  chaptersForPath,
  continueTour,
  currentStep,
  findStep,
  hasNews,
  intentMatches,
  nextStep,
  parseTutorialParam,
  previousStep,
  runAllowedFor,
  shouldOfferTour,
  type TourContext as StepContext,
  type TourRequest,
  type TourRun,
} from '@/lib/tour';
import {
  getTourServerSnapshot,
  getTourSnapshot,
  setTourStorage,
  subscribeTour,
} from '@/lib/tour/store';

import { TourCard } from './TourCard';
import styles from './tour.module.css';

/*
 * Tutorial guiado do painel (etapa 8k). Fica no layout do painel, então sobrevive à navegação entre páginas; a
 * posição no tour vai também para o armazenamento da aba (retomar depois de recarregar).
 *
 * O tutorial NUNCA cria, edita, publica, aprova, suspende nem apaga nada: os passos só explicam, apontam e, nos
 * passos "go", navegam. Antes de navegar, ele confere se a tela tem alterações não salvas (`data-unsaved`) e, se
 * tiver, para e avisa: o tour nunca descarta texto.
 */

type Hint = 'review' | 'news' | null;

type TourApi = {
  role: TourRole;
  /** Versão vista (banco). `null` = não sei: sem cartão automático e sem dica; o "?" funciona. */
  seen: number | null;
  running: boolean;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  /** `opener`: para onde o foco volta ao sair (o "?", por exemplo). */
  start: (request: TourRequest, opener?: HTMLElement | null) => void;
  welcomePending: boolean;
  termsNoticeShown: boolean;
  answerWelcome: (begin: boolean) => void;
  hint: Hint;
  answerHint: (choice: 'ok' | 'news') => void;
  newsAvailable: boolean;
};

const TourApiContext = createContext<TourApi | null>(null);
// O botão "?" (o foco volta a ele quando nada melhor existe). Contexto à parte: um objeto com ref dentro faria o
// compilador do React tratar todo o resto da API como ref.
const HelpButtonRefContext = createContext<RefObject<HTMLButtonElement | null> | null>(null);

export function useTour(): TourApi | null {
  return useContext(TourApiContext);
}

export function useHelpButtonRef(): RefObject<HTMLButtonElement | null> | null {
  return useContext(HelpButtonRefContext);
}

function stepContext(role: TourRole): StepContext {
  let ios = false;
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    ios = isIosSafariOutsideApp(
      detectPlatform({
        userAgent: nav.userAgent,
        maxTouchPoints: nav.maxTouchPoints,
        navigatorStandalone: nav.standalone === true,
        displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches === true,
      }),
    );
  } catch {
    ios = false;
  }
  return { role, iosSafariOutsideApp: ios };
}

/** Há uma tela com alterações não salvas (editor de sessão ou Página Sobre)? */
function hasUnsavedChanges(): boolean {
  return document.querySelector('[data-unsaved="true"]') !== null;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !==
      null
  );
}

export function TourProvider({
  role,
  initialSeen,
  termsNoticeShown,
  children,
}: {
  role: TourRole;
  initialSeen: number | null;
  termsNoticeShown: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stored = useSyncExternalStore(subscribeTour, getTourSnapshot, getTourServerSnapshot);

  const [seen, setSeen] = useState(initialSeen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [welcomeAnswered, setWelcomeAnswered] = useState(false);
  const [reviewHint, setReviewHint] = useState(false);
  const [newsDismissed, setNewsDismissed] = useState(false);
  // Passo que espera a pessoa salvar a tela (o tour não navega por cima de alterações não salvas).
  const [pending, setPending] = useState<TourRun | null>(null);

  const openerRef = useRef<HTMLElement | null>(null);
  const firstRunRef = useRef(false);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);

  // Uma execução guardada só vale para o papel de agora (a pessoa pode ter mudado de cargo).
  const run: TourRun | null =
    stored.run && runAllowedFor(stored.run, { role, iosSafariOutsideApp: true })
      ? stored.run
      : null;
  const running = run !== null;

  const markSeen = useCallback(() => {
    if (seen !== null && seen >= TOUR_VERSION) return;
    startTransition(async () => {
      const result = await markTourSeenAction();
      if (result.ok) setSeen(result.seen);
    });
  }, [seen]);

  const restoreFocus = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    const target = opener?.isConnected ? opener : helpButtonRef.current;
    // O painel ainda está inerte neste instante: o foco vai depois que ele volta.
    requestAnimationFrame(() => target?.focus());
  }, []);

  /**
   * Vai para o passo. Se ele mora em outra página e esta tela tem alterações não salvas, NÃO segue: o cartão avisa
   * e a pessoa salva antes (o tour nunca descarta texto). A navegação em si acontece num só lugar, no efeito abaixo.
   */
  const begin = useCallback((tour: TourRun) => {
    const step = currentStep(tour);
    const here = (chaptersForPath(window.location.pathname) ?? []).includes(step.chapter);
    if (step.route && !here && hasUnsavedChanges()) {
      setPending(tour);
      // Começando agora: o cartão aparece (com o aviso) mesmo sem sair desta tela.
      if (!getTourSnapshot().run) setTourStorage({ v: 1, run: tour });
      return;
    }
    setPending(null);
    setTourStorage({ v: 1, run: tour });
  }, []);

  const retry = useCallback(() => {
    if (pending) begin(pending);
  }, [pending, begin]);

  const start = useCallback(
    (request: TourRequest, opener?: HTMLElement | null) => {
      const tour = buildRun(request, stepContext(role));
      if (!tour) return;
      const active = document.activeElement;
      openerRef.current = opener ?? (active instanceof HTMLElement ? active : null);
      setMenuOpen(false);
      setReviewHint(false);
      markSeen();
      begin(tour);
    },
    [role, markSeen, begin],
  );

  const exit = useCallback(() => {
    setPending(null);
    setTourStorage({ v: 1 });
    restoreFocus();
  }, [restoreFocus]);

  const finish = useCallback(() => {
    const showHint = firstRunRef.current && !termsNoticeShown;
    firstRunRef.current = false;
    markSeen();
    exit();
    if (showHint) setReviewHint(true);
  }, [exit, markSeen, termsNoticeShown]);

  const next = useCallback(() => {
    if (!run) return;
    const following = nextStep(run);
    if (!following) {
      finish();
      return;
    }
    begin(following);
  }, [run, begin, finish]);

  const back = useCallback(() => {
    if (!run) return;
    begin(previousStep(run));
  }, [run, begin]);

  const continueAfterScreen = useCallback(() => {
    if (!run) return;
    const rest = continueTour(run, stepContext(role));
    if (!rest) {
      finish();
      return;
    }
    begin(rest);
  }, [run, role, begin, finish]);

  const answerWelcome = useCallback(
    (beginTour: boolean) => {
      setWelcomeAnswered(true);
      if (beginTour) {
        firstRunRef.current = true;
        start({ mode: 'full' });
      } else {
        markSeen();
        setReviewHint(true);
      }
    },
    [start, markSeen],
  );

  const answerHint = useCallback(
    (choice: 'ok' | 'news') => {
      if (reviewHint) {
        setReviewHint(false);
        helpButtonRef.current?.focus();
        return;
      }
      setNewsDismissed(true);
      if (choice === 'news' && seen !== null) start({ mode: 'news', seen });
      else {
        markSeen();
        helpButtonRef.current?.focus();
      }
    },
    [reviewHint, seen, start, markSeen],
  );

  // `/painel?tutorial=conta`: só inicia com a intenção gravada pelo CLIQUE no link de Minha conta (de uso único e
  // recente); o parâmetro sai do endereço depois de lido, válido ou não. Nunca começa sozinho.
  const tutorialParam = searchParams.get(TUTORIAL_PARAM);
  useEffect(() => {
    if (tutorialParam === null) return;
    const value = parseTutorialParam(tutorialParam);
    const snapshot = getTourSnapshot();
    const ok = intentMatches(value, snapshot.intent ?? null, Date.now());
    const tour =
      ok && value
        ? buildRun({ mode: 'chapter', chapter: chapterOfTutorialValue(value) }, stepContext(role))
        : null;
    setTourStorage(
      tour ? { v: 1, run: tour } : { v: 1, ...(snapshot.run ? { run: snapshot.run } : {}) },
    );
    const url = new URL(window.location.href);
    url.searchParams.delete(TUTORIAL_PARAM);
    router.replace(
      `${url.pathname}${url.search}${url.hash}` as Parameters<typeof router.replace>[0],
      {
        scroll: false,
      },
    );
  }, [tutorialParam, role, router]);

  // Leva à página do passo atual (num passo "go", ou depois de recarregar no meio do tour).
  const stepId = run ? (run.steps[run.index] ?? null) : null;
  useEffect(() => {
    if (!run || stepId === null) return;
    const step = findStep(stepId);
    if (!step?.route) return;
    if ((chaptersForPath(window.location.pathname) ?? []).includes(step.chapter)) return;
    if (hasUnsavedChanges()) return;
    router.push(step.route as Parameters<typeof router.push>[0]);
  }, [run, stepId, router]);

  const announcement = run
    ? `Passo ${run.index + 1} de ${run.steps.length}: ${currentStep(run).title}`
    : '';

  // Atalho "?" (só no computador): nunca dentro de campo, do editor ou com Ctrl, Alt ou Meta; nunca com outro
  // diálogo aberto nem durante o tour. O Shift é permitido: nos teclados brasileiro e americano o "?" o exige.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '?' || event.ctrlKey || event.altKey || event.metaKey) return;
      if (isEditable(event.target) || isEditable(document.activeElement)) return;
      if (getTourSnapshot().run || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      setMenuOpen(true);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const welcomePending = shouldOfferTour(seen) && !welcomeAnswered && !running;
  const newsAvailable = hasNews(seen);
  const hint: Hint = running
    ? null
    : reviewHint
      ? 'review'
      : newsAvailable && !newsDismissed && !termsNoticeShown
        ? 'news'
        : null;

  const api = useMemo<TourApi>(
    () => ({
      role,
      seen,
      running,
      menuOpen,
      setMenuOpen,
      start,
      welcomePending,
      termsNoticeShown,
      answerWelcome,
      hint,
      answerHint,
      newsAvailable,
    }),
    [
      role,
      seen,
      running,
      menuOpen,
      start,
      welcomePending,
      termsNoticeShown,
      answerWelcome,
      hint,
      answerHint,
      newsAvailable,
    ],
  );

  const step = run ? currentStep(run) : null;
  const onRoute =
    step !== null && (!step.route || (chaptersForPath(pathname) ?? []).includes(step.chapter));
  // Passos "info" e "go": o painel fica inerte (o cartão está fora dele). Passo "try": o painel continua
  // interativo, para a pessoa tocar no elemento de verdade.
  const shellInert = step !== null && step.kind !== 'try';

  return (
    <TourApiContext.Provider value={api}>
      <HelpButtonRefContext.Provider value={helpButtonRef}>
        <div className={styles.shell} inert={shellInert || undefined}>
          {children}
        </div>
        <p className={styles.srOnly} aria-live="polite">
          {announcement}
        </p>
        {run && step && (
          <TourCard
            key={`${step.id}|${onRoute ? 'here' : 'away'}`}
            run={run}
            onRoute={onRoute}
            blocked={pending !== null}
            onRetry={retry}
            onNext={next}
            onBack={back}
            onExit={exit}
            onContinue={run.mode === 'screen' ? continueAfterScreen : null}
          />
        )}
      </HelpButtonRefContext.Provider>
    </TourApiContext.Provider>
  );
}
