import { devices, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

import { untilHydrated } from './hydration';

/**
 * Apoio dos testes do cartão "Instale o Entre Capítulos" (etapa 8e). O cartão só aparece no Safari do
 * iPhone/iPad fora do app instalado, e o estado vive no localStorage do aparelho. Estes helpers simulam o
 * aparelho (agente de usuário, modo standalone), o calendário (relógio fixo) e esperam a decisão do cartão sem
 * depender do formato do que ele grava: só da chave do localStorage (a mesma de `src/content/install.ts`).
 */

/** A chave do localStorage. Um teste de unidade confere que `src/content/install.ts` continua com este valor. */
export const INSTALL_KEY = 'ec:install:v1';

/** O atributo que marca página de erro e 404 (`src/content/install.ts`, `suppressAttribute`). */
export const SUPPRESS_ATTRIBUTE = 'data-no-install-card';

/** Opções do iPhone (as mesmas do projeto `webkit-mobile`), sem `defaultBrowserType`, que não vale dentro de um `describe`. */
const { defaultBrowserType, ...iphone } = devices['iPhone 17'];
void defaultBrowserType;
export const IPHONE = iphone;

export const UA = {
  iphoneSafari: devices['iPhone 17'].userAgent,
  /** WKWebView do Instagram: sem o token "Safari/". */
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22H123 Instagram 389.0.0.43.81 (iPhone16,2; iOS 18_7; pt_BR; pt-BR; scale=3.00; 1290x2796; 740898516)',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
} as const;

/** O cartão com os passos (Safari do iOS). */
export const installCard = (page: Page): Locator =>
  page.getByRole('region', { name: 'Instalar o Entre Capítulos' });

/** A dica "abra no Safari" (navegador embutido de aplicativo). */
export const installHint = (page: Page): Locator =>
  page.getByRole('region', { name: 'Dica de instalação' });

/** Qualquer um dos dois, pelo atributo do componente (não depende do texto). */
export const anyInstallCard = (page: Page): Locator => page.locator('[data-install-card]');

const MS_PER_DAY = 86_400_000;

/** Meio-dia de hoje em São Paulo (o fuso dos testes): a âncora dos "dias" simulados. */
function baseNoon(): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
  return new Date(`${today}T12:00:00-03:00`).getTime();
}
const BASE = baseNoon();

/** O dia `n` depois de hoje, ao meio-dia no calendário local (sem horário de verão no Brasil). */
export function dayAt(n: number): Date {
  return new Date(BASE + n * MS_PER_DAY);
}

/**
 * Prepara a página: registra se o cartão chegou a EXISTIR no DOM (`window.__cardSeen`, mesmo por um instante) e
 * o texto guardado antes da carga (`window.__installBefore`), que é o sinal de que a decisão do cartão já rodou.
 */
export async function trackInstall(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript((key) => {
    const w = window as unknown as Record<string, unknown>;
    try {
      w.__installBefore = window.localStorage.getItem(key);
    } catch {
      w.__installBefore = 'indisponível';
    }
    w.__cardSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-install-card]')) w.__cardSeen = true;
    }).observe(document, { childList: true, subtree: true });
  }, INSTALL_KEY);
}

/** O cartão chegou a aparecer no DOM desde o início desta carga? */
export function cardWasSeen(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __cardSeen?: boolean }).__cardSeen === true);
}

/** O texto cru guardado no localStorage (só para comparar antes e depois, sem entender o formato). */
export function rawState(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), INSTALL_KEY);
}

const network = new WeakMap<Page, { last: number }>();

/** Passa a anotar o instante do último pedido ou resposta da página (chame antes de navegar). */
export function watchNetwork(page: Page): void {
  if (network.has(page)) return;
  const state = { last: Date.now() };
  network.set(page, state);
  const touch = () => {
    state.last = Date.now();
  };
  page.on('request', touch);
  page.on('requestfinished', touch);
  page.on('requestfailed', touch);
}

/**
 * Espera a rede ficar quieta: nenhum pedido novo nem resposta por `quietMs`. O Next pré-carrega os links da tela
 * (os da carga uns segundos depois dela, os do rodapé quando rolam para a tela), em rajadas; sair da página ou
 * fechá-la com esses pedidos em andamento faz o WebKit registrar um erro não tratado ("due to access control
 * checks"). `waitForLoadState('networkidle')` não serve aqui: ele já está "atingido" para a página inteira e volta
 * na hora. Não conta os pedidos em andamento: o Chromium deixa alguns sem aviso de término.
 */
export async function idle(page: Page, quietMs = 1000): Promise<void> {
  watchNetwork(page);
  const state = network.get(page)!;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && !page.isClosed()) {
    if (Date.now() - state.last >= quietMs) return;
    await page.waitForTimeout(100).catch(() => undefined);
  }
}

/**
 * Atrasa SÓ o código do cartão (um pedaço de JavaScript carregado sob demanda, o único com `data-install-card`):
 * `wait` é um tempo em milissegundos ou uma promessa que o teste resolve quando quiser. Simula a rede lenta (o cartão
 * chega depois da primeira pintura) e permite medir a página antes e depois de o cartão montar, na mesma carga.
 * Devolve um objeto cujo `hit` vira `true` quando o pedido do código do cartão foi segurado.
 */
export async function delayCardCode(
  page: Page,
  wait: number | Promise<void>,
): Promise<{ hit: boolean }> {
  const state = { hit: false };
  await page.route('**/_next/static/chunks/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes('data-install-card')) {
      state.hit = true;
      await (typeof wait === 'number' ? new Promise((resolve) => setTimeout(resolve, wait)) : wait);
    }
    // O corpo já veio descompactado: sem `content-encoding` nem `content-length` do original.
    const headers = { ...response.headers() };
    delete headers['content-encoding'];
    delete headers['content-length'];
    await route.fulfill({ status: response.status(), headers, body });
  });
  return state;
}

/**
 * Faz o download do código do cartão FALHAR (o pedido é cortado), o que acontece com rede instável, com uma aba aberta
 * antes de um deploy ou com um bloqueador de conteúdo. Devolve um objeto cujo `hit` vira `true` quando o pedido foi cortado.
 */
export async function failCardCode(page: Page): Promise<{ hit: boolean }> {
  const state = { hit: false };
  await page.route('**/_next/static/chunks/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes('data-install-card')) {
      state.hit = true;
      await route.abort('failed');
      return;
    }
    const headers = { ...response.headers() };
    delete headers['content-encoding'];
    delete headers['content-length'];
    await route.fulfill({ status: response.status(), headers, body });
  });
  return state;
}

/** Espera o React assumir a página e dá um tempo para o cartão (carregado sob demanda) aparecer, se fosse aparecer. */
export async function settle(page: Page): Promise<void> {
  await untilHydrated(page.locator('main').first());
  await idle(page);
  await page.waitForTimeout(300);
}

/**
 * Abre `path` no dia `n` (relógio fixo) e espera a decisão do cartão rodar. Num dia novo o aparelho elegível
 * grava a visita: o texto guardado muda, e isso é o sinal. `counts: false` (mesmo dia, recarregar) não muda nada,
 * então só espera a página assentar. `quiet: false` não espera a rede ficar quieta (para quem segura um pedido de propósito).
 */
export async function visit(
  page: Page,
  n: number,
  path: string,
  options: { counts?: boolean; quiet?: boolean } = {},
): Promise<void> {
  const { counts = true, quiet = true } = options;
  watchNetwork(page);
  // A página anterior (se houver) ainda pode estar pré-carregando links: deixa terminar antes de sair dela.
  if (page.url() !== 'about:blank') await idle(page);
  await page.clock.setFixedTime(dayAt(n));
  await page.goto(path);
  await untilHydrated(page.locator('main').first());
  if (counts) {
    await expect
      .poll(
        () =>
          page.evaluate(
            (key) =>
              window.localStorage.getItem(key) !==
              (window as unknown as { __installBefore?: string | null }).__installBefore,
            INSTALL_KEY,
          ),
        { message: 'a visita do dia não foi contada' },
      )
      .toBe(true);
  }
  if (quiet) await idle(page);
  await page.waitForTimeout(300);
}

/** Texto visível do cartão, sem os ícones (SVG decorativos). */
export async function cardText(page: Page): Promise<string> {
  return (await installCard(page).innerText()).replace(/\s+/g, ' ').trim();
}
