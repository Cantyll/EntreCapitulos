/*
 * Em que aparelho e navegador o site está aberto, para o cartão "Instale o Entre Capítulos" (etapa 8e) e para o
 * passo "Conta e instalação" do tutorial (etapa 8c). Funções PURAS: recebem os dados do navegador e não leem
 * `window` nem `navigator` (a leitura fica em `readPlatform`, que recebe o objeto). Só o cliente chama isto,
 * depois da montagem: o servidor nunca decide nada pelo agente de usuário, para não haver divergência de hidratação.
 *
 * O iOS não tem `beforeinstallprompt`: a instalação é manual (Compartilhar, Adicionar à Tela de Início).
 * Desde o iOS e iPadOS 16.4 (a versão mínima do projeto) os navegadores de terceiros também oferecem
 * "Adicionar à Tela de Início", cada um no seu menu: por isso eles NÃO recebem o cartão (não conhecemos o menu de
 * cada um) nem a dica "abra no Safari" (seria falsa).
 *
 * Android e desktop ficam de fora desta etapa (possível evolução: `beforeinstallprompt`).
 */

export type PlatformFamily =
  /** iPhone ou iPad no Safari: recebe o cartão com os passos. */
  | 'ios-safari'
  /** iPhone ou iPad num navegador embutido de aplicativo (Instagram, Facebook…): só a dica "abra no Safari". */
  | 'ios-in-app'
  /** iPhone ou iPad em Chrome, Firefox, Edge etc.: nada. */
  | 'ios-other'
  | 'android'
  | 'desktop'
  | 'unknown';

export type PlatformInput = {
  userAgent: string;
  /** `navigator.maxTouchPoints`; o iPadOS se identifica como Macintosh e só se distingue pelo toque. */
  maxTouchPoints: number;
  /** `navigator.standalone === true` (só existe no Safari do iOS e iPadOS). */
  navigatorStandalone?: boolean;
  /** `matchMedia('(display-mode: standalone)').matches`. */
  displayModeStandalone?: boolean;
};

export type Platform = {
  family: PlatformFamily;
  /** Aberto pelo ícone da Tela de Início (ou do Dock): já está instalado. */
  standalone: boolean;
};

/** O que fazer com este aparelho: o cartão, só a dica, ou nada. */
export type InstallEligibility = 'card' | 'hint' | 'none';

/**
 * Navegadores de outras empresas no iOS (todos usam o motor do Safari, mas têm menu próprio). `Chrome/`, `Firefox/` e
 * `Edg/` são os nomes do agente de computador: o iPadOS os manda quando se pede o "site para computador". O Safari
 * e os navegadores embutidos do iOS nunca trazem esses nomes.
 */
const IOS_OTHER_BROWSERS =
  /\b(CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|Focus\/|Coast\/|Mercury|Vivaldi|Chrome\/|Firefox\/|Edg\/)\b/i;

/** Navegadores embutidos de aplicativos: o menu de compartilhar não é o do Safari. */
const IN_APP_BROWSERS =
  /\b(Instagram|FBAN|FBAV|FB_IAB|FBIOS|FBSS|Messenger|Line\/|TikTok|musical_ly|BytedanceWebview|LinkedInApp|Snapchat|Pinterest|Twitter|MicroMessenger|GSA\/)/i;

const IPAD_AS_MAC = /\bMacintosh\b/;

function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/\b(iPhone|iPod|iPad)\b/.test(userAgent)) return true;
  // iPadOS 13+ pede "site para computador" e se apresenta como Macintosh; só o toque o distingue de um Mac.
  return IPAD_AS_MAC.test(userAgent) && maxTouchPoints > 1;
}

export function detectPlatform(input: PlatformInput): Platform {
  const { userAgent, maxTouchPoints } = input;
  const standalone = input.navigatorStandalone === true || input.displayModeStandalone === true;
  const ua = typeof userAgent === 'string' ? userAgent : '';
  const touch = Number.isFinite(maxTouchPoints) ? maxTouchPoints : 0;

  if (isIosDevice(ua, touch)) {
    if (IOS_OTHER_BROWSERS.test(ua)) return { family: 'ios-other', standalone };
    // O navegador embutido (WKWebView) não manda o token "Safari/"; o Safari de verdade manda "Version/x Safari/y".
    const looksLikeSafari = /\bVersion\/[\d.]+/.test(ua) && /\bSafari\/[\d.]+/.test(ua);
    if (IN_APP_BROWSERS.test(ua) || !looksLikeSafari) return { family: 'ios-in-app', standalone };
    return { family: 'ios-safari', standalone };
  }
  if (/\bAndroid\b/.test(ua)) return { family: 'android', standalone };
  if (/\b(Macintosh|Windows|X11|Linux|CrOS)\b/.test(ua)) return { family: 'desktop', standalone };
  return { family: 'unknown', standalone };
}

/** O que o site faz neste aparelho. Nunca mostra nada no app já instalado. */
export function installEligibility(platform: Platform): InstallEligibility {
  if (platform.standalone) return 'none';
  if (platform.family === 'ios-safari') return 'card';
  if (platform.family === 'ios-in-app') return 'hint';
  return 'none';
}

/**
 * `true` no Safari do iPhone ou iPad FORA do app instalado: o único lugar onde os passos de instalação valem.
 * É a condição do passo "Conta e instalação" do tutorial (8c) e da seção "Instalar no iPhone" de /conta.
 */
export function isIosSafariOutsideApp(platform: Platform): boolean {
  return platform.family === 'ios-safari' && !platform.standalone;
}

/** Só o que `readPlatform` precisa de `window`: dá para testar com um objeto de mentira. */
export type PlatformWindow = {
  navigator: { userAgent: string; maxTouchPoints?: number; standalone?: boolean };
  matchMedia?: (query: string) => { matches: boolean };
};

/** Lê o aparelho atual. Só no cliente, depois da montagem. */
export function readPlatform(win: PlatformWindow): Platform {
  return detectPlatform({
    userAgent: win.navigator.userAgent,
    maxTouchPoints: win.navigator.maxTouchPoints ?? 0,
    navigatorStandalone: win.navigator.standalone,
    displayModeStandalone: win.matchMedia?.('(display-mode: standalone)').matches === true,
  });
}
