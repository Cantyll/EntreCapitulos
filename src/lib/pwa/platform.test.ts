import { describe, expect, it, vi } from 'vitest';

import {
  detectPlatform,
  installEligibility,
  isIosSafariOutsideApp,
  readPlatform,
  type PlatformInput,
  type PlatformWindow,
} from './platform';

/*
 * Agentes de usuário no formato REAL de cada navegador (iOS e iPadOS 18 e 26, Chrome 139, Firefox 142…). Foram
 * escritos a partir dos formatos publicados por cada navegador, não capturados de aparelhos nesta sessão: a
 * conferência em iPhone e iPad de verdade continua pendente (ver o PR da etapa 8e).
 */
const UA = {
  iphoneSafari26:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iphoneSafari17:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneSafari16:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1',
  ipadSafariMobile:
    'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  // iPadOS com "Solicitar site para computador" (o padrão): se apresenta como um Mac.
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/142.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/139.0.3405.102 Mobile/15E148 Safari/605.1.15',
  ipadChrome:
    'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Instagram 389.0.0.43.81 (iPhone15,3; iOS 18_6; pt_BR; pt-BR; scale=3.00; 1290x2796; 740898516)',
  iphoneFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBBV/705847011;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBID/phone;FBLC/pt_BR;FBOP/5;FBRV/0]',
  // Algumas versões do app do Facebook mandam também "Version/" e "Safari/": o token FBAN decide.
  iphoneFacebookWithSafariTokens:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBBV/705847011;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBID/phone;FBLC/pt_BR;FBOP/5;FBRV/0]',
  iphoneTikTok:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_39.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/pt-BR Region/BR RevealType/DIALOG isDarkMode/0 WKWebView/1 BytedanceWebview/d8a21c6',
  iphoneLine:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E219 Safari Line/14.5.0',
  iphoneGoogleApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/370.0.742371180 Mobile/15E148 Safari/604.1',
  iphoneLinkedIn:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LinkedInApp/9.30.1234',
  // Ícone da Tela de Início: o iOS tira "Version/" e "Safari/" do agente de usuário do app instalado.
  iphoneInstalledApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  chromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
} as const;

function input(userAgent: string, extra: Partial<PlatformInput> = {}): PlatformInput {
  return { userAgent, maxTouchPoints: 0, ...extra };
}

describe('detectPlatform: iPhone e iPad no Safari', () => {
  it.each([
    ['iPhone, Safari 26', UA.iphoneSafari26, 5],
    ['iPhone, Safari 17', UA.iphoneSafari17, 5],
    ['iPhone, Safari 16.4 (versão mínima do projeto)', UA.iphoneSafari16, 5],
    ['iPad com agente de usuário móvel (iPad)', UA.ipadSafariMobile, 5],
    // O iPadOS pede o site para computador por padrão: Macintosh e só o toque o distingue de um Mac.
    ['iPad em modo "site para computador" (Macintosh + toque)', UA.macSafari, 5],
    ['iPad em modo "site para computador" com 2 pontos de toque', UA.macSafari, 2],
  ])('%s é Safari do iOS', (_label, userAgent, maxTouchPoints) => {
    expect(detectPlatform({ userAgent, maxTouchPoints })).toEqual({
      family: 'ios-safari',
      standalone: false,
    });
  });

  it('o iPad com agente móvel é iOS mesmo sem pontos de toque informados', () => {
    expect(detectPlatform(input(UA.ipadSafariMobile)).family).toBe('ios-safari');
  });

  it('Mac de mesa (Macintosh sem toque) é desktop, não iPad', () => {
    expect(detectPlatform({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toEqual({
      family: 'desktop',
      standalone: false,
    });
  });

  it('um ponto de toque só não basta para ser iPad (precisa de mais de um)', () => {
    expect(detectPlatform({ userAgent: UA.macSafari, maxTouchPoints: 1 }).family).toBe('desktop');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number])(
    'maxTouchPoints inválido (%s) vale zero: o Mac de mesa continua desktop',
    (maxTouchPoints) => {
      expect(detectPlatform({ userAgent: UA.macSafari, maxTouchPoints }).family).toBe('desktop');
    },
  );
});

describe('detectPlatform: outros navegadores no iPhone e no iPad', () => {
  it.each([
    ['Chrome (CriOS)', UA.iphoneChrome],
    ['Firefox (FxiOS)', UA.iphoneFirefox],
    ['Edge (EdgiOS), que também manda Version/ e Safari/', UA.iphoneEdge],
    ['Chrome no iPad (CriOS)', UA.ipadChrome],
  ])('%s é "ios-other"', (_label, userAgent) => {
    expect(detectPlatform(input(userAgent, { maxTouchPoints: 5 })).family).toBe('ios-other');
  });
});

describe('detectPlatform: outros navegadores, um nome por vez', () => {
  // Sintético: o agente do Safari mais o nome de cada navegador de outra empresa (todos têm menu próprio).
  it.each([
    'CriOS/139.0.7258.76',
    'FxiOS/142.0',
    'EdgiOS/139.0.3405.102',
    'OPiOS/16.0.15',
    'OPT/5.1.0',
    'YaBrowser/25.8.0',
    'DuckDuckGo/7',
    'Focus/142.0',
    'Coast/5.04',
    'Mercury/8.9',
    'Vivaldi/7.5',
  ])('o agente do Safari mais "%s" não é o Safari', (token) => {
    expect(detectPlatform(input(`${UA.iphoneSafari26} ${token}`)).family).toBe('ios-other');
  });

  it('um navegador de outra empresa que também cite um aplicativo continua "ios-other" (sem dica "abra no Safari")', () => {
    expect(detectPlatform(input(`${UA.iphoneChrome} Instagram 389.0`)).family).toBe('ios-other');
  });
});

describe('detectPlatform: iPad em "site para computador" com Chrome, Firefox ou Edge', () => {
  // SINTÉTICO (formato do agente de computador de cada navegador): não sei qual agente exato cada um manda no iPadOS.
  // O que importa: se trouxer o nome do navegador, não é o Safari e não recebe nem o cartão nem a dica "abra no Safari".
  it.each([
    ['Chrome', 'Chrome/139.0.0.0 Safari/537.36'],
    ['Firefox', 'Firefox/142.0'],
    ['Edge', 'Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0'],
  ])('iPad (Macintosh + toque) com %s é "ios-other"', (_name, token) => {
    const userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) ${token}`;
    const platform = detectPlatform(input(userAgent, { maxTouchPoints: 5 }));
    expect(platform.family).toBe('ios-other');
    expect(installEligibility(platform)).toBe('none');
  });

  it('o mesmo agente num Mac de mesa (sem toque) continua sendo desktop', () => {
    expect(detectPlatform(input(UA.macChrome, { maxTouchPoints: 0 })).family).toBe('desktop');
  });

  it('o Safari do iPad em modo desktop (sem nome de outro navegador) continua sendo o Safari', () => {
    expect(detectPlatform(input(UA.macSafari, { maxTouchPoints: 5 })).family).toBe('ios-safari');
  });
});

describe('detectPlatform: navegadores embutidos de aplicativos', () => {
  it.each([
    ['Instagram', UA.iphoneInstagram],
    ['Facebook (FBAN/FBAV)', UA.iphoneFacebook],
    ['Facebook com Version/ e Safari/ no agente', UA.iphoneFacebookWithSafariTokens],
    ['TikTok', UA.iphoneTikTok],
    ['Line', UA.iphoneLine],
    ['app do Google (GSA)', UA.iphoneGoogleApp],
    ['LinkedIn', UA.iphoneLinkedIn],
  ])('%s é "ios-in-app"', (_label, userAgent) => {
    expect(detectPlatform(input(userAgent, { maxTouchPoints: 5 })).family).toBe('ios-in-app');
  });

  it('um navegador embutido que imite o Safari por inteiro ainda é pego pelo nome do aplicativo', () => {
    const imitation = `${UA.iphoneSafari26} Instagram 389.0.0.43.81`;
    expect(detectPlatform(input(imitation)).family).toBe('ios-in-app');
  });

  // Sintético: o agente do Safari por inteiro mais o nome do aplicativo, para cada nome da lista conhecer o seu efeito
  // mesmo quando o navegador embutido imita "Version/" e "Safari/" (a regra do Safari sozinha não os pegaria).
  it.each([
    'Instagram 389.0.0.43.81',
    '[FBAN/FBIOS;FBAV/520.0.0.38.101]',
    'FBIOS',
    'FB_IAB/FB4A',
    'Messenger',
    'Line/14.5.0',
    'TikTok',
    'musical_ly_39.1.0',
    'BytedanceWebview/d8a21c6',
    'LinkedInApp/9.30.1234',
    'Snapchat/12.0.0',
    'Pinterest/9.0',
    'Twitter for iPhone',
    'MicroMessenger/8.0.50',
    'GSA/370.0.742371180',
  ])('o agente do Safari mais "%s" é navegador embutido', (token) => {
    expect(detectPlatform(input(`${UA.iphoneSafari26} ${token}`)).family).toBe('ios-in-app');
  });

  it('um iPhone sem Version/ nem Safari/ e sem nome de aplicativo conhecido não vira Safari', () => {
    expect(detectPlatform(input(UA.iphoneInstalledApp)).family).toBe('ios-in-app');
  });

  it('Safari com Version/ mas sem Safari/ (WebView) não é Safari', () => {
    const webview =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148';
    expect(detectPlatform(input(webview)).family).toBe('ios-in-app');
  });
});

describe('detectPlatform: Android, desktop e desconhecido', () => {
  it.each([
    ['Chrome no Android', UA.androidChrome, 'android'],
    ['Firefox no Android', UA.androidFirefox, 'android'],
    ['Chrome no Windows', UA.windowsChrome, 'desktop'],
    ['Edge no Windows', UA.windowsEdge, 'desktop'],
    ['Firefox no Linux', UA.linuxFirefox, 'desktop'],
    ['Chrome no Mac', UA.macChrome, 'desktop'],
    ['Chrome OS', UA.chromeOs, 'desktop'],
    ['agente vazio', '', 'unknown'],
    ['agente de robô', 'curl/8.9.1', 'unknown'],
    [
      'Googlebot',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'unknown',
    ],
  ])('%s: %s', (_label, userAgent, family) => {
    expect(detectPlatform(input(userAgent)).family).toBe(family);
  });

  it('um tablet Android com muitos pontos de toque continua Android', () => {
    expect(detectPlatform(input(UA.androidChrome, { maxTouchPoints: 10 })).family).toBe('android');
  });

  it('um agente que não é texto não derruba: vira "unknown"', () => {
    expect(
      detectPlatform({ userAgent: undefined as unknown as string, maxTouchPoints: 0 }),
    ).toEqual({
      family: 'unknown',
      standalone: false,
    });
  });
});

describe('detectPlatform: modo standalone', () => {
  it('navigator.standalone === true marca o app instalado', () => {
    expect(detectPlatform(input(UA.iphoneSafari26, { navigatorStandalone: true })).standalone).toBe(
      true,
    );
  });

  it('display-mode: standalone marca o app instalado', () => {
    expect(
      detectPlatform(input(UA.iphoneSafari26, { displayModeStandalone: true })).standalone,
    ).toBe(true);
  });

  it('qualquer um dos dois basta, e os dois juntos também', () => {
    expect(
      detectPlatform(
        input(UA.iphoneSafari26, { navigatorStandalone: false, displayModeStandalone: true }),
      ).standalone,
    ).toBe(true);
    expect(
      detectPlatform(
        input(UA.iphoneSafari26, { navigatorStandalone: true, displayModeStandalone: false }),
      ).standalone,
    ).toBe(true);
    expect(
      detectPlatform(
        input(UA.iphoneSafari26, { navigatorStandalone: true, displayModeStandalone: true }),
      ).standalone,
    ).toBe(true);
  });

  it('false ou ausente nos dois: não é standalone', () => {
    expect(detectPlatform(input(UA.iphoneSafari26)).standalone).toBe(false);
    expect(
      detectPlatform(
        input(UA.iphoneSafari26, { navigatorStandalone: false, displayModeStandalone: false }),
      ).standalone,
    ).toBe(false);
  });

  it('só `true` de verdade conta (nada de valores "quase verdadeiros")', () => {
    const loose = input(UA.iphoneSafari26, {
      navigatorStandalone: 1 as unknown as boolean,
      displayModeStandalone: 'true' as unknown as boolean,
    });
    expect(detectPlatform(loose).standalone).toBe(false);
  });

  it('o app instalado do iPhone (agente sem Safari/) fica standalone', () => {
    expect(
      detectPlatform(input(UA.iphoneInstalledApp, { navigatorStandalone: true })).standalone,
    ).toBe(true);
  });

  it('o standalone vale em qualquer família (Mac no Dock, Android instalado)', () => {
    expect(detectPlatform(input(UA.macSafari, { displayModeStandalone: true }))).toEqual({
      family: 'desktop',
      standalone: true,
    });
    expect(detectPlatform(input(UA.androidChrome, { displayModeStandalone: true }))).toEqual({
      family: 'android',
      standalone: true,
    });
  });
});

describe('installEligibility', () => {
  it('Safari do iOS fora do app: cartão', () => {
    expect(installEligibility({ family: 'ios-safari', standalone: false })).toBe('card');
  });

  it('navegador embutido fora do app: só a dica', () => {
    expect(installEligibility({ family: 'ios-in-app', standalone: false })).toBe('hint');
  });

  it.each(['ios-other', 'android', 'desktop', 'unknown'] as const)('%s: nada', (family) => {
    expect(installEligibility({ family, standalone: false })).toBe('none');
  });

  it.each(['ios-safari', 'ios-in-app', 'ios-other', 'android', 'desktop', 'unknown'] as const)(
    '%s no app instalado: nada, nunca',
    (family) => {
      expect(installEligibility({ family, standalone: true })).toBe('none');
    },
  );

  it('de ponta a ponta, com os agentes reais', () => {
    const eligibility = (userAgent: string, extra: Partial<PlatformInput> = {}) =>
      installEligibility(detectPlatform(input(userAgent, extra)));
    expect(eligibility(UA.iphoneSafari26)).toBe('card');
    expect(eligibility(UA.ipadSafariMobile, { maxTouchPoints: 5 })).toBe('card');
    expect(eligibility(UA.macSafari, { maxTouchPoints: 5 })).toBe('card');
    expect(eligibility(UA.macSafari, { maxTouchPoints: 0 })).toBe('none');
    expect(eligibility(UA.iphoneInstagram)).toBe('hint');
    expect(eligibility(UA.iphoneFacebook)).toBe('hint');
    expect(eligibility(UA.iphoneTikTok)).toBe('hint');
    expect(eligibility(UA.iphoneLine)).toBe('hint');
    expect(eligibility(UA.iphoneChrome)).toBe('none');
    expect(eligibility(UA.iphoneFirefox)).toBe('none');
    expect(eligibility(UA.iphoneEdge)).toBe('none');
    expect(eligibility(UA.androidChrome)).toBe('none');
    expect(eligibility(UA.windowsChrome)).toBe('none');
    expect(eligibility(UA.iphoneSafari26, { navigatorStandalone: true })).toBe('none');
    expect(eligibility(UA.iphoneSafari26, { displayModeStandalone: true })).toBe('none');
    expect(eligibility(UA.iphoneInstalledApp, { navigatorStandalone: true })).toBe('none');
    expect(eligibility(UA.iphoneInstagram, { navigatorStandalone: true })).toBe('none');
  });
});

describe('isIosSafariOutsideApp', () => {
  it('só no Safari do iOS fora do app instalado', () => {
    expect(isIosSafariOutsideApp({ family: 'ios-safari', standalone: false })).toBe(true);
  });

  it('dentro do app instalado, não', () => {
    expect(isIosSafariOutsideApp({ family: 'ios-safari', standalone: true })).toBe(false);
  });

  it.each(['ios-in-app', 'ios-other', 'android', 'desktop', 'unknown'] as const)(
    '%s: não (os passos de instalação só valem no Safari)',
    (family) => {
      expect(isIosSafariOutsideApp({ family, standalone: false })).toBe(false);
    },
  );

  it('com agentes reais', () => {
    const outside = (userAgent: string, extra: Partial<PlatformInput> = {}) =>
      isIosSafariOutsideApp(detectPlatform(input(userAgent, extra)));
    expect(outside(UA.iphoneSafari26)).toBe(true);
    expect(outside(UA.macSafari, { maxTouchPoints: 5 })).toBe(true);
    expect(outside(UA.macSafari, { maxTouchPoints: 0 })).toBe(false);
    expect(outside(UA.iphoneChrome)).toBe(false);
    expect(outside(UA.iphoneInstagram)).toBe(false);
    expect(outside(UA.iphoneSafari26, { navigatorStandalone: true })).toBe(false);
  });
});

function fakeWindow(
  userAgent: string,
  options: {
    maxTouchPoints?: number;
    standalone?: boolean;
    matchMedia?: PlatformWindow['matchMedia'];
  } = {},
): PlatformWindow {
  const navigator: PlatformWindow['navigator'] = { userAgent };
  if (options.maxTouchPoints !== undefined) navigator.maxTouchPoints = options.maxTouchPoints;
  if (options.standalone !== undefined) navigator.standalone = options.standalone;
  const win: PlatformWindow = { navigator };
  if (options.matchMedia) win.matchMedia = options.matchMedia;
  return win;
}

describe('readPlatform', () => {
  it('sem matchMedia (navegador antigo): lê só o navigator', () => {
    expect(readPlatform(fakeWindow(UA.iphoneSafari26, { maxTouchPoints: 5 }))).toEqual({
      family: 'ios-safari',
      standalone: false,
    });
  });

  it('com matchMedia que diz "não standalone": Safari fora do app', () => {
    const matchMedia = vi.fn(() => ({ matches: false }));
    expect(readPlatform(fakeWindow(UA.iphoneSafari26, { matchMedia }))).toEqual({
      family: 'ios-safari',
      standalone: false,
    });
    expect(matchMedia).toHaveBeenCalledWith('(display-mode: standalone)');
  });

  it('com matchMedia que diz "standalone": app instalado', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    const platform = readPlatform(fakeWindow(UA.iphoneSafari26, { matchMedia }));
    expect(platform.standalone).toBe(true);
    expect(installEligibility(platform)).toBe('none');
  });

  it('navigator.standalone === true também marca o app instalado (sem matchMedia)', () => {
    const platform = readPlatform(fakeWindow(UA.iphoneSafari26, { standalone: true }));
    expect(platform.standalone).toBe(true);
    expect(isIosSafariOutsideApp(platform)).toBe(false);
  });

  it('navigator.standalone === false não marca nada', () => {
    expect(readPlatform(fakeWindow(UA.iphoneSafari26, { standalone: false })).standalone).toBe(
      false,
    );
  });

  it('sem maxTouchPoints informado vale zero: o Mac continua desktop', () => {
    expect(readPlatform(fakeWindow(UA.macSafari)).family).toBe('desktop');
  });

  it('com maxTouchPoints 5: o iPad em modo desktop é Safari do iOS', () => {
    expect(readPlatform(fakeWindow(UA.macSafari, { maxTouchPoints: 5 })).family).toBe('ios-safari');
  });

  it('matchMedia que devolve algo sem `matches` (undefined) não é standalone', () => {
    const matchMedia = (() => ({})) as unknown as PlatformWindow['matchMedia'];
    expect(readPlatform(fakeWindow(UA.iphoneSafari26, { matchMedia })).standalone).toBe(false);
  });

  it('lê os dados do navegador a cada chamada (nada fica guardado entre chamadas)', () => {
    const win = fakeWindow(UA.iphoneSafari26);
    expect(readPlatform(win).standalone).toBe(false);
    win.navigator.standalone = true;
    expect(readPlatform(win).standalone).toBe(true);
  });
});
