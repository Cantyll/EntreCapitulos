import { afterEach, describe, expect, it, vi } from 'vitest';

import { logFailure } from '@/lib/auth/log';

import { evaluateInstall, type InstallEvaluation, type InstallWindow } from './install-client';
import {
  EMPTY_INSTALL_STATE,
  dismissForever,
  dismissLater,
  parseInstallState,
  saveInstallState,
  serializeInstallState,
  type InstallState,
  type InstallSurface,
} from './install-state';

const KEY = 'ec:install:v1';
const DAY = 86_400_000;

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ipadSafariMobile:
    'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Instagram 389.0.0.43.81 (iPhone15,3; iOS 18_6; pt_BR; pt-BR; scale=3.00; 1290x2796; 740898516)',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
} as const;

type FakeOptions = {
  userAgent?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  /** `matchMedia('(display-mode: standalone)').matches` */
  displayModeStandalone?: boolean;
  search?: string;
  /** Texto já guardado na chave do cartão. */
  stored?: string | null;
};

/** Uma janela de mentira com `localStorage` na memória (e espiões para ver o que foi lido e gravado). */
function fakeWindow(options: FakeOptions = {}) {
  const data = new Map<string, string>();
  if (options.stored != null) data.set(KEY, options.stored);
  const getItem = vi.fn((key: string) => data.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => {
    data.set(key, value);
  });
  const win: InstallWindow = {
    navigator: {
      userAgent: options.userAgent ?? UA.iphoneSafari,
      maxTouchPoints: options.maxTouchPoints ?? 5,
      standalone: options.standalone,
    },
    matchMedia:
      options.displayModeStandalone === undefined
        ? undefined
        : () => ({ matches: options.displayModeStandalone === true }),
    localStorage: { getItem, setItem },
    location: { search: options.search ?? '' },
  };
  return { win, data, getItem, setItem };
}

type Fake = ReturnType<typeof fakeWindow>;

/**
 * O que o `InstallGate` faz com o resultado: grava a visita contada, menos na pré-visualização e quando o navegador
 * recusou o armazenamento (um texto guardado quebrado não impede: a gravação o conserta).
 */
function visit(
  fake: Fake,
  now: Date,
  options: { surface?: InstallSurface; pathname?: string } = {},
): InstallEvaluation {
  const evaluation = evaluateInstall(
    fake.win,
    options.surface ?? 'public',
    options.pathname ?? '/',
    now,
  );
  if (evaluation.canSave && evaluation.decision.persist && !evaluation.preview) {
    saveInstallState(() => fake.win.localStorage, evaluation.decision.state);
  }
  return evaluation;
}

const day = (n: number, hour = 12) => new Date(2026, 5, n, hour, 0); // junho de 2026, hora local

describe('evaluateInstall: o fluxo completo no Safari do iPhone', () => {
  it('dia 1: não mostra, conta a visita e pede para gravar', () => {
    const fake = fakeWindow();
    const result = evaluateInstall(fake.win, 'public', '/', day(10));
    expect(result.decision.view).toBeNull();
    expect(result.decision.persist).toBe(true);
    expect(result.decision.state).toEqual({
      visits: 1,
      lastDay: '2026-06-10',
      dismissedAt: null,
      never: false,
    });
    expect(result.preview).toBe(false);
    expect(result.loadFailed).toBe(false);
    expect(result.loadError).toBeUndefined();
    expect(result.canSave).toBe(true);
  });

  it('só lê: evaluateInstall nunca grava', () => {
    const fake = fakeWindow();
    evaluateInstall(fake.win, 'public', '/', day(10));
    expect(fake.setItem).not.toHaveBeenCalled();
    expect(fake.data.size).toBe(0);
  });

  it('dia 1 e dia 2: no dia 2 mostra o cartão', () => {
    const fake = fakeWindow();
    expect(visit(fake, day(10)).decision.view).toBeNull();
    const second = visit(fake, day(11));
    expect(second.decision.view).toBe('card');
    expect(second.decision.state.visits).toBe(2);
    expect(second.decision.persist).toBe(true);
  });

  it('o mesmo dia não recontagem: recarregar não passa de 1 visita e não pede para gravar', () => {
    const fake = fakeWindow();
    visit(fake, day(10, 8));
    const reload = visit(fake, day(10, 21));
    expect(reload.decision.view).toBeNull();
    expect(reload.decision.persist).toBe(false);
    expect(reload.decision.state.visits).toBe(1);
    expect(fake.setItem).toHaveBeenCalledTimes(1);
  });

  it('no dia 2, recarregar continua mostrando e não grava de novo', () => {
    const fake = fakeWindow();
    visit(fake, day(10));
    visit(fake, day(11));
    const reload = visit(fake, day(11, 20));
    expect(reload.decision.view).toBe('card');
    expect(reload.decision.persist).toBe(false);
    expect(fake.setItem).toHaveBeenCalledTimes(2);
  });

  it('virar o dia à meia-noite local conta uma nova visita', () => {
    const fake = fakeWindow();
    visit(fake, new Date(2026, 5, 10, 23, 59));
    const next = visit(fake, new Date(2026, 5, 11, 0, 1));
    expect(next.decision.view).toBe('card');
    expect(next.decision.state.visits).toBe(2);
  });

  it('"Agora não": esconde nas visitas seguintes e volta depois de 60 dias', () => {
    const fake = fakeWindow();
    visit(fake, day(10));
    const shown = visit(fake, day(11));
    expect(shown.decision.view).toBe('card');
    // O que o botão faz: grava o estado contado com a dispensa.
    const dismissedAt = day(11, 13);
    saveInstallState(() => fake.win.localStorage, dismissLater(shown.decision.state, dismissedAt));

    expect(visit(fake, day(12)).decision.view).toBeNull();
    expect(
      visit(fake, new Date(dismissedAt.getTime() + 59 * DAY + 23 * 3_600_000)).decision.view,
    ).toBeNull();
    const back = visit(fake, new Date(dismissedAt.getTime() + 60 * DAY));
    expect(back.decision.view).toBe('card');
  });

  it('"Já instalei": nunca mais mostra, nem meses depois', () => {
    const fake = fakeWindow();
    visit(fake, day(10));
    const shown = visit(fake, day(11));
    saveInstallState(() => fake.win.localStorage, dismissForever(shown.decision.state));
    expect(visit(fake, day(12)).decision.view).toBeNull();
    expect(visit(fake, new Date(2027, 5, 10)).decision.view).toBeNull();
    expect(visit(fake, new Date(2030, 0, 1)).decision.view).toBeNull();
  });

  it('no painel mostra no primeiro acesso', () => {
    const fake = fakeWindow();
    const first = visit(fake, day(10), { surface: 'panel', pathname: '/painel' });
    expect(first.decision.view).toBe('card');
    expect(first.decision.persist).toBe(true);
  });

  it('uma dispensa feita no painel esconde também no site público (o estado é um só)', () => {
    const fake = fakeWindow();
    visit(fake, day(10));
    const panel = visit(fake, day(11), { surface: 'panel', pathname: '/painel' });
    saveInstallState(() => fake.win.localStorage, dismissLater(panel.decision.state, day(11)));
    expect(visit(fake, day(12)).decision.view).toBeNull();
  });

  it('o estado fica na chave versionada, no formato validado', () => {
    const fake = fakeWindow();
    visit(fake, day(10));
    expect(fake.setItem).toHaveBeenCalledWith(
      KEY,
      serializeInstallState({ visits: 1, lastDay: '2026-06-10', dismissedAt: null, never: false }),
    );
  });
});

describe('evaluateInstall: iPad', () => {
  it('iPad com agente móvel (iPad): mostra a partir da 2ª visita', () => {
    const fake = fakeWindow({ userAgent: UA.ipadSafariMobile });
    expect(visit(fake, day(10)).decision.view).toBeNull();
    expect(visit(fake, day(11)).decision.view).toBe('card');
  });

  it('iPad em modo desktop (Macintosh com toque): mostra a partir da 2ª visita', () => {
    const fake = fakeWindow({ userAgent: UA.macSafari, maxTouchPoints: 5 });
    expect(visit(fake, day(10)).decision.view).toBeNull();
    expect(visit(fake, day(11)).decision.view).toBe('card');
  });

  it('Mac de mesa (sem toque): nada, e nada é lido nem gravado', () => {
    const fake = fakeWindow({ userAgent: UA.macSafari, maxTouchPoints: 0 });
    expect(visit(fake, day(10)).decision.view).toBeNull();
    expect(visit(fake, day(11)).decision.view).toBeNull();
    expect(fake.getItem).not.toHaveBeenCalled();
    expect(fake.setItem).not.toHaveBeenCalled();
  });
});

describe('evaluateInstall: aparelhos que nunca mostram nada', () => {
  function expectUntouched(fake: Fake, result: InstallEvaluation) {
    expect(result.decision.view).toBeNull();
    expect(result.decision.persist).toBe(false);
    expect(result.decision.state).toEqual(EMPTY_INSTALL_STATE);
    expect(result.loadFailed).toBe(false);
    expect(result.loadError).toBeUndefined();
    // Nem lê nem grava o armazenamento: o site não guarda nada nesses aparelhos.
    expect(fake.getItem).not.toHaveBeenCalled();
    expect(fake.setItem).not.toHaveBeenCalled();
  }

  it.each([
    ['app instalado (navigator.standalone)', { standalone: true }],
    ['app instalado (display-mode: standalone)', { displayModeStandalone: true }],
    ['Chrome no iPhone', { userAgent: UA.iphoneChrome }],
    ['Android', { userAgent: UA.androidChrome, maxTouchPoints: 5 }],
    ['desktop Windows', { userAgent: UA.windowsChrome, maxTouchPoints: 0 }],
    ['desktop Mac', { userAgent: UA.macSafari, maxTouchPoints: 0 }],
  ] as const)('%s', (_label, options) => {
    // Mesmo com um estado antigo que pediria o cartão, nada aparece.
    const stored = serializeInstallState({
      visits: 9,
      lastDay: '2026-01-01',
      dismissedAt: null,
      never: false,
    });
    for (const surface of ['public', 'panel'] as const) {
      const fake = fakeWindow({ ...options, stored });
      expectUntouched(fake, evaluateInstall(fake.win, surface, '/', day(10)));
    }
  });

  it('no app instalado, ?instalacao=ver também não mostra nada (e não é "pré-visualização")', () => {
    const fake = fakeWindow({ standalone: true, search: '?instalacao=ver' });
    const result = evaluateInstall(fake.win, 'public', '/', day(10));
    expect(result.preview).toBe(false);
    expectUntouched(fake, result);
  });

  it.each([
    ['desktop', { userAgent: UA.windowsChrome, maxTouchPoints: 0 }],
    ['Android', { userAgent: UA.androidChrome }],
    ['Chrome no iPhone', { userAgent: UA.iphoneChrome }],
  ] as const)('em %s, ?instalacao=ver não mostra nada', (_label, options) => {
    const fake = fakeWindow({ ...options, search: '?instalacao=ver' });
    const result = evaluateInstall(fake.win, 'public', '/', day(10));
    expect(result.preview).toBe(false);
    expectUntouched(fake, result);
  });

  it('um localStorage cuja propriedade lançaria nem é tocado nesses aparelhos', () => {
    const { win } = fakeWindow({ userAgent: UA.windowsChrome, maxTouchPoints: 0 });
    const touched = vi.fn();
    Object.defineProperty(win, 'localStorage', {
      get() {
        touched();
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    const result = evaluateInstall(win, 'public', '/', day(10));
    expect(result.loadFailed).toBe(false);
    expect(touched).not.toHaveBeenCalled();
  });
});

describe('evaluateInstall: ?instalacao=ver', () => {
  it('mostra o cartão já na 1ª visita, sem contar nem pedir para gravar', () => {
    const fake = fakeWindow({ search: '?instalacao=ver' });
    const result = evaluateInstall(fake.win, 'public', '/', day(10));
    expect(result.preview).toBe(true);
    expect(result.decision.view).toBe('card');
    expect(result.decision.persist).toBe(false);
    expect(result.decision.state).toEqual(EMPTY_INSTALL_STATE);
    expect(fake.setItem).not.toHaveBeenCalled();
  });

  it('ignora "Agora não" e "Já instalei"', () => {
    const base: InstallState = {
      visits: 4,
      lastDay: '2026-06-09',
      dismissedAt: null,
      never: false,
    };
    const dismissed = serializeInstallState(dismissLater(base, day(9)));
    const never = serializeInstallState(dismissForever(base));
    for (const stored of [dismissed, never]) {
      const fake = fakeWindow({ search: '?instalacao=ver', stored });
      const result = evaluateInstall(fake.win, 'public', '/', day(10));
      expect(result.decision.view).toBe('card');
      expect(result.decision.persist).toBe(false);
    }
  });

  it('não grava nada, nem com o fluxo do Gate, e deixa o estado guardado como estava', () => {
    const stored = serializeInstallState({
      visits: 1,
      lastDay: '2026-06-09',
      dismissedAt: null,
      never: false,
    });
    const fake = fakeWindow({ search: '?instalacao=ver', stored });
    const result = visit(fake, day(10));
    expect(result.decision.view).toBe('card');
    expect(fake.setItem).not.toHaveBeenCalled();
    expect(fake.data.get(KEY)).toBe(stored);
  });

  it('vale com outros parâmetros na consulta', () => {
    const fake = fakeWindow({ search: '?utm=a&instalacao=ver' });
    expect(evaluateInstall(fake.win, 'public', '/', day(10)).preview).toBe(true);
  });

  it('outro valor não liga a pré-visualização', () => {
    for (const search of ['?instalacao=VER', '?instalacao=', '?instalacao=sim', '']) {
      const fake = fakeWindow({ search });
      const result = evaluateInstall(fake.win, 'public', '/', day(10));
      expect(result.preview).toBe(false);
      expect(result.decision.view).toBeNull();
    }
  });

  it('a rota excluída continua valendo: a pré-visualização não mostra nada', () => {
    for (const pathname of ['/entrar', '/boas-vindas', '/conta/excluida']) {
      const fake = fakeWindow({ search: '?instalacao=ver' });
      const result = evaluateInstall(fake.win, 'public', pathname, day(10));
      expect(result.preview).toBe(true);
      expect(result.decision.view).toBeNull();
      expect(result.decision.persist).toBe(false);
    }
  });
});

describe('evaluateInstall: rotas excluídas', () => {
  it.each(['/entrar', '/boas-vindas', '/conta/excluida'])(
    '%s: a visita conta, nada aparece e a visita seguinte, noutra rota, mostra',
    (pathname) => {
      const fake = fakeWindow();
      const first = visit(fake, day(10), { pathname });
      expect(first.decision.view).toBeNull();
      expect(first.decision.state.visits).toBe(1);
      const second = visit(fake, day(11), { pathname });
      expect(second.decision.view).toBeNull();
      expect(second.decision.state.visits).toBe(2);
      expect(visit(fake, day(11, 18), { pathname: '/sessoes' }).decision.view).toBe('card');
    },
  );

  it('no painel também', () => {
    const fake = fakeWindow();
    expect(
      visit(fake, day(10), { surface: 'panel', pathname: '/entrar' }).decision.view,
    ).toBeNull();
  });
});

describe('evaluateInstall: navegador embutido (dica)', () => {
  it('Instagram: dica só a partir da 2ª visita no site público', () => {
    const fake = fakeWindow({ userAgent: UA.iphoneInstagram });
    expect(visit(fake, day(10)).decision.view).toBeNull();
    expect(visit(fake, day(11)).decision.view).toBe('hint');
  });

  it('Instagram no painel: dica no 1º acesso', () => {
    const fake = fakeWindow({ userAgent: UA.iphoneInstagram });
    expect(visit(fake, day(10), { surface: 'panel' }).decision.view).toBe('hint');
  });

  it('"Agora não" na dica esconde por 60 dias; "Já instalei" nunca volta', () => {
    const fake = fakeWindow({ userAgent: UA.iphoneInstagram });
    visit(fake, day(10));
    const shown = visit(fake, day(11));
    expect(shown.decision.view).toBe('hint');
    saveInstallState(() => fake.win.localStorage, dismissLater(shown.decision.state, day(11)));
    expect(visit(fake, day(13)).decision.view).toBeNull();
    expect(visit(fake, new Date(day(11).getTime() + 61 * DAY)).decision.view).toBe('hint');
    saveInstallState(() => fake.win.localStorage, dismissForever(EMPTY_INSTALL_STATE));
    expect(visit(fake, new Date(2027, 0, 1)).decision.view).toBeNull();
  });

  it('?instalacao=ver não força a dica (não é pré-visualização)', () => {
    const fake = fakeWindow({ userAgent: UA.iphoneInstagram, search: '?instalacao=ver' });
    const first = visit(fake, day(10));
    expect(first.preview).toBe(false);
    expect(first.decision.view).toBeNull();
    expect(first.decision.persist).toBe(true);
    expect(fake.setItem).toHaveBeenCalledTimes(1);
    expect(visit(fake, day(11)).decision.view).toBe('hint');
  });

  it('respeita as rotas excluídas', () => {
    const fake = fakeWindow({ userAgent: UA.iphoneInstagram });
    visit(fake, day(10));
    expect(visit(fake, day(11), { pathname: '/entrar' }).decision.view).toBeNull();
  });
});

describe('evaluateInstall: armazenamento que falha', () => {
  it('a propriedade localStorage lança SecurityError: loadFailed e o erro volta', () => {
    const { win } = fakeWindow();
    const error = new DOMException('The operation is insecure.', 'SecurityError');
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw error;
      },
    });
    const result = evaluateInstall(win, 'public', '/', day(10));
    expect(result.loadFailed).toBe(true);
    expect(result.canSave).toBe(false);
    expect(result.loadError).toBe(error);
    expect((result.loadError as DOMException).name).toBe('SecurityError');
    // Sem contagem, no site público não aparece nada.
    expect(result.decision.view).toBeNull();
  });

  it('getItem lança: loadFailed e o erro volta', () => {
    const { win } = fakeWindow();
    const error = new DOMException('Access denied', 'SecurityError');
    win.localStorage.getItem = () => {
      throw error;
    };
    const result = evaluateInstall(win, 'public', '/', day(10));
    expect(result.loadFailed).toBe(true);
    expect(result.canSave).toBe(false);
    expect(result.loadError).toBe(error);
    expect(result.decision.view).toBeNull();
  });

  it('texto guardado quebrado: loadFailed com SyntaxError, estado volta ao zero, mas dá para gravar', () => {
    const fake = fakeWindow({ stored: '{"v":1,"visits":' });
    const result = evaluateInstall(fake.win, 'public', '/', day(10));
    expect(result.loadFailed).toBe(true);
    expect(result.canSave).toBe(true);
    expect(result.loadError).toBeInstanceOf(SyntaxError);
    expect(result.decision.view).toBeNull();
    expect(result.decision.state.visits).toBe(1);
  });

  it('texto guardado em outro formato não é falha: só recomeça do zero', () => {
    const fake = fakeWindow({ stored: JSON.stringify({ v: 2, visits: 9 }) });
    const result = evaluateInstall(fake.win, 'public', '/', day(10));
    expect(result.loadFailed).toBe(false);
    expect(result.decision.state.visits).toBe(1);
  });

  it('armazenamento recusado: o fluxo do Gate não grava nada', () => {
    const fake = fakeWindow();
    fake.win.localStorage.getItem = () => {
      throw new DOMException('Access denied', 'SecurityError');
    };
    const result = visit(fake, day(10));
    expect(result.loadFailed).toBe(true);
    expect(fake.setItem).not.toHaveBeenCalled();
  });

  it('texto quebrado: o fluxo do Gate regrava, e na carga seguinte não há falha e a visita conta', () => {
    const fake = fakeWindow({ stored: '{quebrado' });
    const first = visit(fake, day(10));
    expect(first.loadFailed).toBe(true);
    expect(fake.setItem).toHaveBeenCalledTimes(1);
    expect(parseInstallState(fake.data.get(KEY)!).visits).toBe(1);

    // Dia seguinte: sem falha, a 2ª visita é contada e o cartão aparece.
    const second = visit(fake, day(11));
    expect(second.loadFailed).toBe(false);
    expect(second.decision.state.visits).toBe(2);
    expect(second.decision.view).toBe('card');
  });

  it('no painel, sem armazenamento a dispensa só vale na página: o cartão volta a cada acesso', () => {
    const { win } = fakeWindow();
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    const first = evaluateInstall(win, 'panel', '/painel', day(10));
    expect(first.loadFailed).toBe(true);
    expect(first.decision.view).toBe('card');
    expect(evaluateInstall(win, 'panel', '/painel', day(11)).decision.view).toBe('card');
  });

  it('o erro de leitura nunca leva a chave nem o texto guardado ao registro (só o nome)', () => {
    const secret = 'VALOR-GUARDADO-NAO-PODE-VAZAR';
    const fake = fakeWindow({ stored: `{"v":1,"visits":${secret}` });
    const result = evaluateInstall(fake.win, 'public', '/', day(10));
    expect(result.loadFailed).toBe(true);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      logFailure('cartão de instalação: leitura', result.loadError);
      expect(spy).toHaveBeenCalledTimes(1);
      const printed = JSON.stringify(spy.mock.calls);
      expect(printed).toContain('cartão de instalação: leitura falhou');
      expect(printed).toContain('SyntaxError');
      expect(printed).not.toContain(secret);
      expect(printed).not.toContain(KEY);
      expect(printed).not.toContain('ec:install');
    } finally {
      spy.mockRestore();
    }
  });

  it('o erro de acesso ao armazenamento também só leva o nome ao registro', () => {
    const { win } = fakeWindow();
    const error = new DOMException(`Acesso negado a ${KEY} com {"visits":3}`, 'SecurityError');
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw error;
      },
    });
    const result = evaluateInstall(win, 'public', '/', day(10));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      logFailure('cartão de instalação: leitura', result.loadError);
      const printed = JSON.stringify(spy.mock.calls);
      expect(printed).toContain('SecurityError');
      expect(printed).not.toContain(KEY);
      expect(printed).not.toContain('visits');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('evaluateInstall: a falha de gravação, vista pelo fluxo do Gate', () => {
  afterEach(() => vi.restoreAllMocks());

  it('setItem lança QuotaExceededError: o erro volta e a leitura seguinte recomeça do zero', () => {
    const fake = fakeWindow();
    const error = new DOMException('Quota exceeded', 'QuotaExceededError');
    fake.win.localStorage.setItem = () => {
      throw error;
    };
    const result = evaluateInstall(fake.win, 'public', '/', day(10));
    const saved = saveInstallState(() => fake.win.localStorage, result.decision.state);
    expect(saved.failed).toBe(true);
    expect(saved.error).toBe(error);
    // Nada ficou guardado: a próxima leitura é "primeira visita" de novo.
    expect(evaluateInstall(fake.win, 'public', '/', day(11)).decision.state.visits).toBe(1);
  });
});
