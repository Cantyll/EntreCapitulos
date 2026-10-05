import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { INSTALL_RULES } from '../../src/content/install';
import { detectPlatform, installEligibility } from '../../src/lib/pwa/platform';
import { expect, test as base } from '../support/fixtures';
import {
  INSTALL_KEY,
  IPHONE,
  SUPPRESS_ATTRIBUTE,
  UA,
  anyInstallCard,
  cardText,
  cardWasSeen,
  dayAt,
  delayCardCode,
  failCardCode,
  idle,
  installCard,
  installHint,
  rawState,
  settle,
  trackInstall,
  visit,
  watchNetwork,
} from '../support/install';
import { createAdmin, createModerator, createUser } from '../support/users';

/**
 * Cartão "Instale o Entre Capítulos" (etapa 8e).
 *
 * O WebKit do Playwright é o motor do Safari, mas NÃO é o Safari real nem o app instalado: o aparelho é simulado
 * pelo agente de usuário e pelo `navigator.standalone`. Cada teste usa um contexto novo (localStorage limpo) e o
 * calendário é simulado com o relógio fixo (`page.clock`), sem depender do formato do que o cartão guarda: só a
 * chave do localStorage. O fixture `guard` (global) continua falhando em CSP, `console.error`, erro não tratado e 5xx.
 *
 * Uma ausência só vale se a decisão do cartão de fato rodou: por isso `visit` espera a visita do dia ser contada
 * (o texto guardado muda) e cada cenário tem um controle em que o mesmo caminho MOSTRA o cartão.
 */

/**
 * Antes de fechar a página (ou o contexto de `openAs`), espera a rede assentar: o WebKit registra um erro não
 * tratado quando os pré-carregamentos do Next ainda estão em andamento no momento em que a página é fechada.
 */
const test = base.extend({
  page: async ({ page }, use) => {
    watchNetwork(page);
    await use(page);
    await idle(page);
  },
  openAs: async ({ openAs }, use) => {
    const opened: Page[] = [];
    await use(async (user) => {
      const result = await openAs(user);
      watchNetwork(result.page);
      opened.push(result.page);
      return result;
    });
    for (const page of opened) await idle(page);
  },
});

const STEPS = [
  'Toque em Compartilhar.',
  'Escolha Adicionar à Tela de Início.',
  'Toque em Adicionar.',
];
const NOTES = ['Abrir como app da Web', 'Editar Ações'];
const HINT_TEXT = 'Para instalar como aplicativo, abra este site no Safari.';
const NOT_IN_CARD = /Abrir como app da Web|Editar Ações|⋯|\biOS\b|\biPadOS\b|\bversão\b/;

/** A 1ª visita (dia 0): a decisão do cartão roda, a visita é contada e nada aparece. */
async function firstVisitDay0(page: Page, path = '/') {
  await visit(page, 0, path);
  await expect(anyInstallCard(page)).toHaveCount(0);
}

/** axe (WCAG 2.0 A e AA): falha com qualquer violação "serious" ou "critical". */
async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map(
      (v) =>
        `${v.id} (${v.impact}): ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    ),
    `${label}: violações de acessibilidade`,
  ).toEqual([]);
}

/** Cada trecho do texto das seções de passos de /sobre e /conta (passos e observações). */
async function expectGuide(section: ReturnType<Page['locator']>) {
  for (const step of STEPS) {
    await expect(section.getByText(step, { exact: true })).toBeVisible();
  }
  for (const note of NOTES) {
    await expect(section.getByText(note)).toBeVisible();
  }
}

/** O texto exato que o navegador de teste coleta de `logFailure` (nome do erro e do construtor, nada mais). */
const readFailureMessage =
  /^cartão de instalação: leitura falhou \{name: SecurityError, constructorName: DOMException\}$/;
const writeFailureMessage =
  /^cartão de instalação: gravação falhou \{name: QuotaExceededError, constructorName: DOMException\}$/;

/** Coleta o texto e os argumentos (como JSON) de cada `console.error` da página. */
function collectErrors(page: Page) {
  const texts: string[] = [];
  const dumps: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    texts.push(message.text());
    void Promise.all(message.args().map((arg) => arg.jsonValue().catch(() => '?'))).then((args) =>
      dumps.push(JSON.stringify(args)),
    );
  });
  return { texts, dumps };
}

test('a chave do localStorage e o atributo de exclusão são os de src/content/install.ts', () => {
  expect(INSTALL_RULES.storageKey).toBe(INSTALL_KEY);
  expect(INSTALL_RULES.suppressAttribute).toBe(SUPPRESS_ATTRIBUTE);
});

// ---------------------------------------------------------------------------------------------------------------
test.describe('cartão de instalação: Safari do iPhone @mobile', () => {
  test.use(IPHONE);

  test.beforeEach(async ({ page }) => {
    await trackInstall(page);
  });

  test('o aparelho de teste é classificado como Safari do iOS', async ({ page }) => {
    await page.goto('/');
    const device = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
    }));
    expect(device.userAgent).toBe(UA.iphoneSafari);
    const platform = detectPlatform({ ...device, navigatorStandalone: false });
    expect(platform).toEqual({ family: 'ios-safari', standalone: false });
    expect(installEligibility(platform)).toBe('card');
  });

  test('não aparece na 1ª visita nem ao recarregar no mesmo dia; aparece na 2ª', async ({
    page,
  }) => {
    await firstVisitDay0(page);
    // Recarregar e navegar no mesmo dia não contam como outra visita.
    await visit(page, 0, '/', { counts: false });
    await expect(anyInstallCard(page)).toHaveCount(0);
    await visit(page, 0, '/sobre', { counts: false });
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await cardWasSeen(page)).toBe(false);
    // Dia seguinte: aparece.
    await visit(page, 1, '/');
    await expect(installCard(page)).toBeVisible();
  });

  test('o cartão tem só os passos essenciais, a semântica certa e fica no fim do conteúdo', async ({
    page,
  }) => {
    await firstVisitDay0(page);
    await visit(page, 1, '/');
    const card = installCard(page);
    await expect(card).toBeVisible();

    await expect(card).toHaveAttribute('data-install-card', 'card');
    await expect(
      card.getByRole('heading', { level: 2, name: 'Instale o Entre Capítulos' }),
    ).toBeVisible();
    await expect(card.getByRole('listitem')).toHaveText(STEPS);
    await expect(card.getByRole('button')).toHaveText(['Agora não', 'Já instalei']);
    // Só os passos essenciais: nada de versão do iOS nem as observações (elas ficam em /sobre e /conta).
    expect(await cardText(page)).not.toMatch(NOT_IN_CARD);
    await expect(anyInstallCard(page)).toHaveCount(1);
    await expect(installHint(page)).toHaveCount(0);

    // No fim do `<main id="conteudo">`, antes do rodapé, e nunca acima da dobra.
    const place = await page.evaluate(() => {
      const el = document.querySelector('[data-install-card="card"]')!;
      const main = document.getElementById('conteudo')!;
      const footer = document.querySelector('footer')!;
      const box = el.getBoundingClientRect();
      return {
        inMain: main.contains(el),
        lastBlock: main.lastElementChild!.contains(el),
        bottom: box.bottom,
        footerTop: footer.getBoundingClientRect().top,
        topInPage: box.top + window.scrollY,
        viewport: window.innerHeight,
      };
    });
    expect(place.inMain).toBe(true);
    expect(place.lastBlock).toBe(true);
    expect(place.bottom).toBeLessThanOrEqual(place.footerTop + 0.5);
    expect(place.topInPage, 'o cartão não pode ficar acima da dobra').toBeGreaterThan(
      place.viewport,
    );
  });

  test('"Agora não" esconde: ao recarregar, ao navegar e nos dias seguintes', async ({ page }) => {
    await firstVisitDay0(page);
    await visit(page, 1, '/');
    await installCard(page).getByRole('button', { name: 'Agora não' }).click();
    await expect(anyInstallCard(page)).toHaveCount(0);

    // Navegação no cliente (sem recarregar).
    await page.getByRole('link', { name: 'Estante' }).first().click();
    await expect(page).toHaveURL(/\/estante$/);
    await settle(page);
    await expect(anyInstallCard(page)).toHaveCount(0);

    // Recarregar no mesmo dia, outra página e dias seguintes.
    await visit(page, 1, '/estante', { counts: false });
    await expect(anyInstallCard(page)).toHaveCount(0);
    await visit(page, 1, '/sobre', { counts: false });
    await expect(anyInstallCard(page)).toHaveCount(0);
    await visit(page, 2, '/');
    await expect(anyInstallCard(page)).toHaveCount(0);
    await visit(page, 20, '/sobre');
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await cardWasSeen(page)).toBe(false);
  });

  test('"Agora não" expira em 60 dias', async ({ page }) => {
    await firstVisitDay0(page);
    await visit(page, 1, '/');
    await installCard(page).getByRole('button', { name: 'Agora não' }).click();
    await expect(anyInstallCard(page)).toHaveCount(0);

    // 59 dias depois da dispensa: ainda escondido. 61 dias depois: volta.
    await visit(page, 1 + 59, '/');
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await cardWasSeen(page)).toBe(false);
    await visit(page, 1 + 61, '/');
    await expect(installCard(page)).toBeVisible();
  });

  test('"Já instalei" esconde para sempre', async ({ page }) => {
    await firstVisitDay0(page);
    await visit(page, 1, '/');
    await installCard(page).getByRole('button', { name: 'Já instalei' }).click();
    await expect(anyInstallCard(page)).toHaveCount(0);

    await visit(page, 1, '/', { counts: false });
    await expect(anyInstallCard(page)).toHaveCount(0);
    await visit(page, 2, '/sobre');
    await expect(anyInstallCard(page)).toHaveCount(0);
    // Bem além dos 60 dias da outra dispensa.
    await visit(page, 1 + 400, '/');
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await cardWasSeen(page)).toBe(false);
  });

  // ---- ?instalacao=ver ----------------------------------------------------------------------------------------
  test('?instalacao=ver mostra o cartão na 1ª visita e depois de dispensar, sem gravar nada', async ({
    page,
  }) => {
    // 1ª visita, sem nenhum dado: mostra e não grava.
    await page.clock.setFixedTime(dayAt(0));
    await page.goto('/?instalacao=ver');
    await expect(installCard(page)).toBeVisible();
    expect(await rawState(page)).toBeNull();

    // Dispensa de verdade ("Já instalei") e confere que a pré-visualização ignora isso.
    await visit(page, 0, '/');
    await visit(page, 1, '/');
    await installCard(page).getByRole('button', { name: 'Já instalei' }).click();
    await expect(anyInstallCard(page)).toHaveCount(0);
    const saved = await rawState(page);
    expect(saved).not.toBeNull();

    await visit(page, 1, '/?instalacao=ver', { counts: false });
    await expect(installCard(page)).toBeVisible();
    expect(await rawState(page)).toBe(saved);
    // Em outro dia e dispensando a pré-visualização: continua sem gravar nada.
    await page.clock.setFixedTime(dayAt(5));
    await page.goto('/sobre?instalacao=ver');
    await expect(installCard(page)).toBeVisible();
    await installCard(page).getByRole('button', { name: 'Agora não' }).click();
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await rawState(page)).toBe(saved);
    // Sem o parâmetro, a dispensa de verdade continua valendo.
    await visit(page, 5, '/', { counts: true });
    await expect(anyInstallCard(page)).toHaveCount(0);
  });

  test('?instalacao=ver não passa para a página seguinte numa navegação no cliente', async ({
    page,
  }) => {
    await page.clock.setFixedTime(dayAt(0));
    await page.goto('/?instalacao=ver');
    await expect(installCard(page)).toBeVisible();
    // Navegação no cliente, sem recarregar: o endereço novo não tem o parâmetro, então é a 1ª visita comum.
    await page.getByRole('link', { name: 'Estante' }).first().click();
    await expect(page).toHaveURL(/\/estante$/);
    await settle(page);
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await cardWasSeen(page)).toBe(true);
  });

  for (const path of ['/entrar', '/conta/excluida']) {
    test(`?instalacao=ver não mostra o cartão em rota excluída (${path})`, async ({ page }) => {
      await page.clock.setFixedTime(dayAt(0));
      await page.goto(`${path}?instalacao=ver`);
      await settle(page);
      await expect(anyInstallCard(page)).toHaveCount(0);
      expect(await cardWasSeen(page)).toBe(false);
      expect(await rawState(page)).toBeNull();
      // Controle: o mesmo parâmetro mostra o cartão numa rota permitida.
      await page.goto('/sobre?instalacao=ver');
      await expect(installCard(page)).toBeVisible();
    });
  }

  // ---- rotas excluídas --------------------------------------------------------------------------------------
  /**
   * Na 2ª visita, numa rota excluída: nada aparece (nem por um instante) e a visita é contada. O controle
   * (mesmo dia, rota permitida) mostra o cartão: prova que ele apareceria se a rota não fosse excluída.
   */
  async function expectExcludedRoute(page: Page, path: string) {
    await visit(page, 0, '/');
    await visit(page, 1, path);
    await settle(page);
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await cardWasSeen(page), `${path}: o cartão chegou a existir no DOM`).toBe(false);
    await visit(page, 1, '/', { counts: false });
    await expect(installCard(page)).toBeVisible();
  }

  test('rota excluída: /entrar', async ({ page }) => {
    await expectExcludedRoute(page, '/entrar');
    // Subcaminho e consulta continuam valendo.
    await visit(page, 1, '/entrar?next=/estante', { counts: false });
    await settle(page);
    expect(await cardWasSeen(page)).toBe(false);
  });

  test('rota excluída: /conta/excluida', async ({ page }) => {
    await expectExcludedRoute(page, '/conta/excluida');
  });

  test('rota excluída: /boas-vindas (quem entrou e ainda não escolheu o nome)', async ({
    openAs,
  }) => {
    const { page, context } = await openAs(await createUser({ name: null }));
    await trackInstall(context);
    await visit(page, 0, '/sobre');
    await visit(page, 1, '/boas-vindas');
    await expect(page.getByLabel('Como devemos chamar você nos comentários?')).toBeVisible();
    await settle(page);
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await cardWasSeen(page)).toBe(false);
    // Controle: o mesmo aparelho, no mesmo dia, mostra o cartão numa rota permitida.
    await visit(page, 1, '/sobre', { counts: false });
    await expect(installCard(page)).toBeVisible();
  });

  test('o editor de sessões do painel não tem o cartão', async ({ openAs }) => {
    const { page, context } = await openAs(await createAdmin());
    await trackInstall(context);
    // Controle: na Visão geral o cartão aparece (desde o 1º acesso).
    await page.goto('/painel');
    await expect(installCard(page)).toBeVisible();
    await page.goto('/painel/sessoes/nova');
    await expect(page.locator('[data-editor-root]')).toBeVisible();
    await settle(page);
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await cardWasSeen(page)).toBe(false);
  });

  test('404 dentro do layout público (livro que não existe): sem cartão', async ({
    page,
    guard,
  }) => {
    guard.allowStatus(404);
    await visit(page, 0, '/');
    await visit(page, 1, '/livros/nao-existe');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Não encontramos esta página' }),
    ).toBeVisible();
    // É o 404 DENTRO do layout público (com o cabeçalho e o `<main id="conteudo">` do site).
    await expect(page.locator('main#conteudo')).toBeVisible();
    await expect(page.locator(`[${SUPPRESS_ATTRIBUTE}]`)).toHaveCount(1);
    await settle(page);
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await cardWasSeen(page), 'o cartão chegou a existir no DOM do 404').toBe(false);
    // Controle: no mesmo dia, uma página que existe mostra o cartão.
    await visit(page, 1, '/', { counts: false });
    await expect(installCard(page)).toBeVisible();
  });

  test('404 geral (endereço que não existe em lugar nenhum): sem cartão', async ({
    page,
    guard,
  }) => {
    guard.allowStatus(404);
    await visit(page, 0, '/');
    await visit(page, 1, '/uma-pagina-que-nao-existe', { counts: false });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Não encontramos esta página' }),
    ).toBeVisible();
    await settle(page);
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await cardWasSeen(page)).toBe(false);
  });

  test('página de erro REAL: o cartão some e volta quando o erro passa', async ({
    page,
    guard,
  }) => {
    // O que o navegador registra quando o envio da Server Action é cortado (Chromium e WebKit).
    guard.allowConsole(
      /^Failed to load resource: net::ERR_FAILED$/,
      // O Chromium acrescenta a pilha (linhas "at ..."), o WebKit não: a regra aceita as duas formas.
      /^TypeError: (Failed to fetch|Load failed)(\n[\s\S]*)?$/,
    );
    const slug = '/livros/e2e-leitura/sessoes/1';
    await visit(page, 0, '/');
    await visit(page, 1, slug);
    await expect(installCard(page)).toBeVisible();

    // Corta o envio do progresso de leitura (uma Server Action): o erro sobe até a página de erro do site.
    await page.route(`**${slug}`, (route) =>
      route.request().method() === 'POST' ? route.abort() : route.continue(),
    );
    await page.getByLabel('Li até o').first().selectOption({ label: 'Capítulo 1' });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Algo deu errado por aqui' }),
    ).toBeVisible();
    await expect(page.locator(`[${SUPPRESS_ATTRIBUTE}]`)).toHaveCount(1);
    // O marcador surgiu DEPOIS da montagem: o cartão que já estava na tela sai.
    await expect(anyInstallCard(page)).toHaveCount(0);

    // O erro passa: "Tentar de novo" remove a página de erro e o cartão volta.
    await page.unroute(`**${slug}`);
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(page.getByRole('heading', { name: 'Algo deu errado por aqui' })).toHaveCount(0);
    await expect(page.locator(`[${SUPPRESS_ATTRIBUTE}]`)).toHaveCount(0);
    await expect(installCard(page)).toBeVisible();
  });

  test('o código do cartão não carrega: o site continua de pé, sem cartão e com UM aviso só com o nome do erro', async ({
    page,
    guard,
  }) => {
    // O navegador registra o pedido cortado e o erro do `import()`; a mensagem do aviso do site tem texto exato.
    const failureMessage =
      /^cartão de instalação: carregamento falhou \{name: [A-Za-z]+, constructorName: [A-Za-z]+\}$/;
    guard.allowConsole(
      failureMessage,
      /^Failed to load resource: net::ERR_FAILED$/,
      /^Failed to load resource: (the server responded|A network error|Load failed)/,
      // O próprio runtime do Next registra o erro que o isolador capturou (com a pilha no Chromium).
      /^ChunkLoadError: Failed to load chunk \/_next\/static\/chunks\/[\w.-]+\.js from module \d+(\n[\s\S]*)?$/,
    );
    await visit(page, 0, '/');
    const errors = collectErrors(page);
    const blocked = await failCardCode(page);
    await visit(page, 1, '/', { quiet: false });
    await expect
      .poll(() => blocked.hit, { message: 'o código do cartão não foi pedido' })
      .toBe(true);
    await settle(page);

    // O site segue inteiro: nada de "Algo deu errado por aqui", e o cartão não existe.
    await expect(page.getByRole('heading', { name: 'Algo deu errado por aqui' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(anyInstallCard(page)).toHaveCount(0);
    // Navegar no cliente continua funcionando.
    await page.getByRole('link', { name: 'Estante' }).first().click();
    await expect(page).toHaveURL(/\/estante$/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    // Um aviso do site, só com o nome do erro e do construtor (nunca a chave nem o valor guardado).
    const own = errors.texts.filter((text) => text.startsWith('cartão de instalação:'));
    expect(own).toHaveLength(1);
    expect(own[0]).toMatch(failureMessage);
    expect([...errors.texts, ...errors.dumps].join('\n')).not.toMatch(/ec:install|visits|lastDay/);
  });

  test('o mecanismo da página de erro e do 404: o marcador esconde o cartão e, ao sair, ele volta', async ({
    page,
  }) => {
    await visit(page, 0, '/');
    await visit(page, 1, '/');
    await expect(installCard(page)).toBeVisible();

    await page.evaluate((attribute) => {
      const marker = document.createElement('span');
      marker.hidden = true;
      marker.setAttribute(attribute, '');
      marker.id = 'marcador-de-teste';
      document.getElementById('conteudo')!.appendChild(marker);
    }, SUPPRESS_ATTRIBUTE);
    await expect(anyInstallCard(page)).toHaveCount(0);

    await page.evaluate(() => document.getElementById('marcador-de-teste')!.remove());
    await expect(installCard(page)).toBeVisible();
  });

  // ---- app instalado --------------------------------------------------------------------------------------
  for (const [label, install] of [
    [
      'navigator.standalone (Tela de Início do iOS)',
      () => Object.defineProperty(navigator, 'standalone', { get: () => true }),
    ],
    [
      'display-mode: standalone (Dock do Mac)',
      () => {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query: string) => {
          const list = original(query);
          if (!/display-mode:\s*standalone/.test(query)) return list;
          return new Proxy(list, {
            get: (target, prop) => (prop === 'matches' ? true : Reflect.get(target, prop)),
          }) as MediaQueryList;
        };
      },
    ],
  ] as const) {
    test(`app instalado (${label}): nunca aparece, nem no painel nem com ?instalacao=ver`, async ({
      openAs,
    }) => {
      const admin = await createAdmin();
      // O aparelho já tem as visitas contadas (numa aba comum, sem standalone): o cartão apareceria.
      const { page: browser, context: ctx } = await openAs(admin);
      await trackInstall(ctx);
      await visit(browser, 0, '/sobre');
      await visit(browser, 1, '/sobre');
      await expect(installCard(browser)).toBeVisible();
      const before = await rawState(browser);

      // O app instalado (aba nova, mesmo armazenamento): nada aparece e nada é contado.
      const app = await ctx.newPage();
      watchNetwork(app);
      await app.addInitScript(install);
      await app.clock.setFixedTime(dayAt(2));
      for (const path of ['/sobre', '/sobre?instalacao=ver', '/painel']) {
        await app.goto(path);
        await settle(app);
        await expect(anyInstallCard(app), path).toHaveCount(0);
        expect(await cardWasSeen(app), path).toBe(false);
      }
      expect(await rawState(app), 'o app instalado não conta visita').toBe(before);

      // Controle: a aba comum, no mesmo dia, mostra o cartão.
      await visit(browser, 2, '/sobre');
      await expect(installCard(browser)).toBeVisible();
    });
  }

  // ---- /sobre e /conta ------------------------------------------------------------------------------------
  test('/sobre tem a seção "Leia como aplicativo" com os passos e as observações', async ({
    page,
  }) => {
    await page.goto('/sobre');
    const section = page.locator('#app');
    await expect(
      section.getByRole('heading', { level: 2, name: 'Leia como aplicativo' }),
    ).toBeVisible();
    await expectGuide(section);
  });

  test('/conta tem "Instalar no iPhone" no Safari do iOS, mesmo depois de dispensar o cartão', async ({
    openAs,
  }) => {
    const { page, context } = await openAs(await createUser());
    await trackInstall(context);
    await visit(page, 0, '/sobre');
    await visit(page, 1, '/sobre');
    await installCard(page).getByRole('button', { name: 'Já instalei' }).click();
    await expect(anyInstallCard(page)).toHaveCount(0);

    await page.goto('/conta');
    const section = page.locator('[data-install-guide="account"]');
    await expect(
      section.getByRole('heading', { level: 2, name: 'Instalar no iPhone' }),
    ).toBeVisible();
    await expectGuide(section);
    await expect(page.getByRole('heading', { name: 'Excluir minha conta' })).toBeVisible();
  });

  test('/conta no app instalado não tem "Instalar no iPhone"', async ({ openAs }) => {
    const { page } = await openAs(await createUser());
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'standalone', { get: () => true }),
    );
    await page.goto('/conta');
    await expect(page.getByRole('heading', { name: 'Excluir minha conta' })).toBeVisible();
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Instalar no iPhone' })).toHaveCount(0);
  });

  // ---- painel ---------------------------------------------------------------------------------------------
  test('administração: cartão na Visão geral desde o 1º acesso; dispensar vale ao recarregar', async ({
    openAs,
  }) => {
    const { page, context } = await openAs(await createAdmin());
    await trackInstall(context);
    await page.goto('/painel');
    const card = installCard(page);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-install-card', 'card');
    expect(await card.evaluate((el) => !!el.closest('main'))).toBe(true);
    expect(await cardText(page)).not.toMatch(NOT_IN_CARD);

    await card.getByRole('button', { name: 'Agora não' }).click();
    await expect(anyInstallCard(page)).toHaveCount(0);
    await page.reload();
    await settle(page);
    await expect(anyInstallCard(page)).toHaveCount(0);
  });

  test('moderação: cartão no topo de Comentários, acima das abas', async ({ openAs }) => {
    const { page, context } = await openAs(await createModerator());
    await trackInstall(context);
    // `/painel` manda a moderadora para Comentários.
    await page.goto('/painel');
    await expect(page).toHaveURL(/\/painel\/comentarios$/);
    const card = installCard(page);
    await expect(card).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Estado dos comentários' });
    const [cardBox, tabsBox] = await Promise.all([card.boundingBox(), tabs.boundingBox()]);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(tabsBox!.y + 0.5);
    await card.getByRole('button', { name: 'Já instalei' }).click();
    await expect(anyInstallCard(page)).toHaveCount(0);
    await page.reload();
    await settle(page);
    await expect(anyInstallCard(page)).toHaveCount(0);
  });

  // ---- qualidade --------------------------------------------------------------------------------------------
  test('acessibilidade: axe sem violação séria com o cartão visível (site e painel)', async ({
    page,
    openAs,
  }) => {
    test.slow();
    await firstVisitDay0(page, '/sobre');
    await visit(page, 1, '/sobre');
    await expect(installCard(page)).toBeVisible();
    await expectNoSeriousViolations(page, '/sobre com o cartão');

    const { page: panel } = await openAs(await createAdmin());
    await panel.goto('/painel');
    await expect(installCard(panel)).toBeVisible();
    await expectNoSeriousViolations(panel, '/painel com o cartão');
  });

  test('texto de pelo menos 16px, sem foco automático e sem animação', async ({ page }) => {
    await firstVisitDay0(page);
    await visit(page, 1, '/');
    const card = installCard(page);
    await expect(card).toBeVisible();

    // Todo texto do cartão, botões incluídos, tem 16px ou mais.
    const small = await card.evaluate((root) => {
      const out: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>('h2, p, li, li > span, button')) {
        const own = Array.from(el.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== '',
        );
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (own && size < 16) out.push(`${el.tagName} ${size}px`);
      }
      return out;
    });
    expect(small).toEqual([]);

    // Sem foco automático: o foco continua no corpo da página.
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');

    // Sem animação, com ou sem "reduzir movimento".
    const animations = () => card.evaluate((el) => el.getAnimations({ subtree: true }).length);
    expect(await animations()).toBe(0);
    const box = await card.boundingBox();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(card).toBeVisible();
    expect(await animations()).toBe(0);
    expect(await card.boundingBox()).toEqual(box);
  });

  test('alvos de toque de 44px nos botões do cartão e da dica', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'webkit-mobile',
      'só o projeto de iPhone mede alvos de toque',
    );
    await firstVisitDay0(page);
    await visit(page, 1, '/');
    const buttons = installCard(page).getByRole('button');
    await expect(buttons).toHaveCount(2);
    for (const name of ['Agora não', 'Já instalei']) {
      const box = await installCard(page).getByRole('button', { name }).boundingBox();
      expect(box!.width, `${name}: largura`).toBeGreaterThanOrEqual(43.5);
      expect(box!.height, `${name}: altura`).toBeGreaterThanOrEqual(43.5);
    }
  });

  // ---- layout: sem salto ---------------------------------------------------------------------------------------
  const FIRST_BLOCKS = ['/', '/sobre', '/estante'];
  for (const path of FIRST_BLOCKS) {
    test(`o conteúdo acima do cartão não se mexe quando ele monta (${path})`, async ({ page }) => {
      await firstVisitDay0(page, path);
      // Segura SÓ o código do cartão (carregado sob demanda), para medir antes e depois na mesma carga.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const holding = await delayCardCode(page, held);
      await visit(page, 1, path, { quiet: false });
      await expect(anyInstallCard(page)).toHaveCount(0);

      const measure = () =>
        page.evaluate(() => {
          const rect = (el: Element | null) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return [r.x, r.y + window.scrollY, r.width, r.height].map(
              (n) => Math.round(n * 100) / 100,
            );
          };
          const main = document.getElementById('conteudo')!;
          return {
            h1: rect(main.querySelector('h1')),
            firstBlock: rect(main.firstElementChild),
            header: rect(document.querySelector('header')),
            mainTop: rect(main)!.slice(0, 2),
          };
        });
      const before = await measure();
      expect(before.h1).not.toBeNull();
      expect(before.firstBlock).not.toBeNull();

      release();
      await expect(installCard(page)).toBeVisible();
      expect(holding.hit, 'o código do cartão não foi carregado sob demanda').toBe(true);
      const after = await measure();
      expect(after).toEqual(before);
    });
  }

  /**
   * DESLOCAMENTO DO RODAPÉ (CLS), COMPORTAMENTO ACEITO pela dona do projeto (sem reservar altura). O cartão só é
   * decidido no navegador (de propósito: sem divergência de hidratação), então o servidor não reserva o espaço dele.
   * O que fica registrado aqui, medido com o código do cartão atrasado para chegar DEPOIS da primeira pintura:
   *  - página LONGA (o rodapé fica fora da tela): nenhum deslocamento, zero;
   *  - página tão CURTA que o rodapé aparece na tela: o cartão empurra o rodapé para baixo, no máximo UMA vez por
   *    carga, e só o rodapé se mexe (o conteúdo acima do cartão nunca se mexe: ver o teste anterior).
   * Só o Chromium implementa `layout-shift`. No e2e todas as páginas públicas são longas (a estante tem 80 livros de
   * teste), então a curta é simulada com um CSS de entrada que limita a altura do conteúdo da página: o cabeçalho, o
   * rodapé e o cartão são os de verdade. Se um dia o espaço do cartão passar a ser reservado, este teste deve mudar
   * junto com a decisão registrada no CLAUDE.md.
   */
  const CARD_DELAY = 1500;
  const LONG_PAGES = [
    { label: 'página longa (/estante)', path: '/estante' },
    { label: 'home', path: '/' },
    { label: '/sobre', path: '/sobre' },
    { label: 'a mais curta de verdade (/sessoes)', path: '/sessoes' },
  ];

  type Shift = {
    value: number;
    /** Cada nó que se mexeu, com a posição vertical antes e depois e se ele é o rodapé ou está dentro dele. */
    moves: { node: string; inFooter: boolean; fromY: number; toY: number }[];
  };

  /** Abre o `path` na 2ª visita com o código do cartão atrasado e devolve os deslocamentos de layout da carga. */
  async function measureCardShifts(page: Page, path: string, shorten?: number) {
    await page.addInitScript((limit) => {
      const w = window as unknown as { __shifts: Shift[]; __fcp?: number };
      w.__shifts = [];
      // O relógio do teste substitui `performance.getEntries*`: a primeira pintura vem de um observador.
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') w.__fcp = entry.startTime;
        }
      }).observe({ type: 'paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
          sources?: {
            node?: Node | null;
            previousRect: DOMRectReadOnly;
            currentRect: DOMRectReadOnly;
          }[];
        }[]) {
          if (entry.hadRecentInput) continue;
          w.__shifts.push({
            value: entry.value,
            moves: (entry.sources ?? []).map((source) => ({
              node: (source.node as Element | null)?.nodeName ?? '?',
              inFooter: !!(source.node as Element | null)?.closest?.('footer'),
              fromY: Math.round(source.previousRect.y),
              toY: Math.round(source.currentRect.y),
            })),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
      if (limit) {
        // O CSS entra assim que o `<html>` existe, antes da primeira pintura.
        const add = () => {
          if (!document.documentElement) return false;
          const style = document.createElement('style');
          style.textContent = `main#conteudo > :first-child { max-height: ${limit}px; overflow: hidden; }`;
          document.documentElement.appendChild(style);
          return true;
        };
        if (!add()) {
          const observer = new MutationObserver(() => add() && observer.disconnect());
          observer.observe(document, { childList: true });
        }
      }
    }, shorten ?? 0);

    await visit(page, 0, path);
    // Rede lenta: o código do cartão chega 1,5 s depois da carga, bem depois da primeira pintura da página.
    const slow = await delayCardCode(page, CARD_DELAY);
    await visit(page, 1, path, { quiet: false });
    // O cartão apareceu de verdade (senão a medida não prova nada).
    await expect(installCard(page)).toBeVisible();
    expect(slow.hit, 'o código do cartão não foi carregado sob demanda').toBe(true);
    // Tempo para qualquer segundo deslocamento aparecer, se houvesse.
    await page.waitForTimeout(1000);
    const paint = await page.evaluate(
      () => (window as unknown as { __fcp?: number }).__fcp ?? null,
    );
    expect(paint, 'a página já tinha sido pintada quando o cartão chegou').not.toBeNull();
    expect(paint!).toBeLessThan(CARD_DELAY);
    return page.evaluate(() => {
      const footer = document.querySelector('footer')!.getBoundingClientRect();
      return {
        shifts: (window as unknown as { __shifts: Shift[] }).__shifts,
        pageHeight: document.documentElement.scrollHeight,
        footerInViewport: footer.top < window.innerHeight,
      };
    });
  }

  for (const { label, path } of LONG_PAGES) {
    test(`rodapé fora da tela: o cartão aparecendo na 2ª visita não desloca nada (zero): ${label}`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium-desktop', 'só o Chromium mede layout-shift');
      const result = await measureCardShifts(page, path);
      expect(
        result.footerInViewport,
        `${label}: o rodapé precisa estar fora da tela (altura ${result.pageHeight}px)`,
      ).toBe(false);
      expect(result.shifts, `${label}: deslocamentos de layout`).toEqual([]);
    });
  }

  test('rodapé na tela (página curta): o cartão empurra só o rodapé, uma vez por carga (comportamento aceito)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'só o Chromium mede layout-shift');
    // Página curta SIMULADA: o conteúdo da página tem 120px e o rodapé aparece na tela.
    const result = await measureCardShifts(page, '/sobre', 120);
    expect(result.footerInViewport, 'a página curta precisa mostrar o rodapé na tela').toBe(true);

    // Exatamente um deslocamento nesta carga (o cartão monta uma vez) e só o rodapé, ou algo dentro dele, se mexeu.
    expect(result.shifts, JSON.stringify(result.shifts)).toHaveLength(1);
    const [shift] = result.shifts;
    expect(shift!.value, JSON.stringify(shift)).toBeGreaterThan(0);
    expect(
      shift!.moves.every((move) => move.inFooter),
      JSON.stringify(shift),
    ).toBe(true);
    // O rodapé desceu: o cartão ocupou o espaço acima dele.
    const footer = shift!.moves.find((move) => move.node === 'FOOTER');
    expect(footer, JSON.stringify(shift)).toBeDefined();
    expect(footer!.toY, JSON.stringify(shift)).toBeGreaterThan(footer!.fromY);
  });

  // ---- falha de armazenamento ----------------------------------------------------------------------------
  test('armazenamento recusado na leitura: o site funciona, sem cartão, e UM aviso só com o nome do erro', async ({
    page,
    guard,
  }) => {
    guard.allowConsole(readFailureMessage);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('x', 'SecurityError');
        },
      });
    });
    const errors = collectErrors(page);
    await page.clock.setFixedTime(dayAt(0));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await settle(page);
    // Um carregamento de página, UM aviso. O cartão nunca aparece no site público.
    expect(errors.texts).toHaveLength(1);
    expect(errors.texts[0]).toMatch(readFailureMessage);
    await expect(anyInstallCard(page)).toHaveCount(0);

    // Navegar no cliente (sem recarregar) não registra outra vez, e o site continua funcionando.
    await page.getByRole('link', { name: 'Estante' }).first().click();
    await expect(page).toHaveURL(/\/estante$/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await settle(page);
    expect(errors.texts).toHaveLength(1);
    await expect(anyInstallCard(page)).toHaveCount(0);

    // Uma nova carga de página, outro dia: mais um aviso (um por carga) e ainda sem cartão.
    await page.clock.setFixedTime(dayAt(1));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await settle(page);
    expect(errors.texts).toHaveLength(2);
    await expect(anyInstallCard(page)).toHaveCount(0);

    // Nunca a chave nem o valor: só o nome do erro e do construtor.
    const everything = [...errors.texts, ...errors.dumps].join('\n');
    expect(everything).not.toMatch(/ec:install|visits|lastDay|dismissedAt|never/);
    const expected = JSON.stringify([
      'cartão de instalação: leitura falhou',
      { name: 'SecurityError', constructorName: 'DOMException' },
    ]);
    expect(errors.dumps).toEqual([expected, expected]);
  });

  test('armazenamento recusado na gravação: o site funciona, sem cartão, e UM aviso só com o nome do erro', async ({
    page,
    guard,
  }) => {
    guard.allowConsole(writeFailureMessage);
    await page.addInitScript(() => {
      const fake = {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('x', 'QuotaExceededError');
        },
      };
      Object.defineProperty(window, 'localStorage', { get: () => fake });
    });
    const errors = collectErrors(page);
    await page.clock.setFixedTime(dayAt(0));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect.poll(() => errors.texts.length).toBe(1);
    await settle(page);
    expect(errors.texts).toEqual(
      expect.arrayContaining([expect.stringMatching(writeFailureMessage)]),
    );
    expect(errors.texts).toHaveLength(1);
    // Sem como contar visitas, o site público não mostra o cartão.
    await expect(anyInstallCard(page)).toHaveCount(0);

    // Navegar no cliente: a gravação falha de novo, mas o aviso é um só por carga de página.
    await page.getByRole('link', { name: 'Estante' }).first().click();
    await expect(page).toHaveURL(/\/estante$/);
    await settle(page);
    expect(errors.texts).toHaveLength(1);

    const everything = [...errors.texts, ...errors.dumps].join('\n');
    expect(everything).not.toMatch(/ec:install|visits|lastDay|dismissedAt|never/);
    expect(errors.dumps).toEqual([
      JSON.stringify([
        'cartão de instalação: gravação falhou',
        { name: 'QuotaExceededError', constructorName: 'DOMException' },
      ]),
    ]);
  });

  test('se a leitura falha (getItem lança), nada é gravado depois', async ({
    page,
    context,
    guard,
  }) => {
    guard.allowConsole(readFailureMessage);
    // O armazenamento de mentira registra cada gravação em `window.__writes`.
    const install = (readThrows: boolean) => {
      const writes: string[] = [];
      (window as unknown as { __writes: string[] }).__writes = writes;
      const fake = {
        getItem: () => {
          if (readThrows) throw new DOMException('x', 'SecurityError');
          return null;
        },
        setItem: (key: string) => {
          writes.push(key);
        },
      };
      Object.defineProperty(window, 'localStorage', { get: () => fake });
    };
    const writes = (target: Page) =>
      target.evaluate(() => (window as unknown as { __writes: string[] }).__writes.length);

    // Controle: com a leitura funcionando, a visita é gravada (o armazenamento de mentira registra a gravação).
    const control = await context.newPage();
    watchNetwork(control);
    await control.addInitScript(install, false);
    await control.clock.setFixedTime(dayAt(0));
    await control.goto('/sobre');
    await expect.poll(() => writes(control)).toBeGreaterThan(0);
    await idle(control);

    // Leitura recusada: o aviso sai, e nenhuma gravação é tentada.
    watchNetwork(page);
    await page.addInitScript(install, true);
    const errors = collectErrors(page);
    await visit(page, 1, '/sobre', { counts: false });
    await visit(page, 2, '/sobre', { counts: false });
    expect(await writes(page)).toBe(0);
    expect(errors.texts).toHaveLength(2);
    await expect(anyInstallCard(page)).toHaveCount(0);
  });

  test('valor guardado com formato errado (JSON válido): volta ao zero, é regravado e o cartão aparece na 2ª visita', async ({
    page,
  }) => {
    await visit(page, 0, '/sobre');
    await page.evaluate(
      (key) => window.localStorage.setItem(key, '{"v":2,"visits":99}'),
      INSTALL_KEY,
    );
    // Formato desconhecido não é erro de armazenamento: nenhum aviso (o guard falharia), e a visita é gravada de novo.
    await visit(page, 1, '/sobre');
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await rawState(page)).not.toBe('{"v":2,"visits":99}');
    await visit(page, 2, '/sobre');
    await expect(installCard(page)).toBeVisible();
  });

  test('valor guardado quebrado (não é JSON): um aviso só com o nome do erro, é regravado e se conserta sozinho', async ({
    page,
    guard,
  }) => {
    // O que o navegador de teste coleta de `logFailure` para o erro do JSON.parse.
    guard.allowConsole(
      /^cartão de instalação: leitura falhou \{name: SyntaxError, constructorName: SyntaxError\}$/,
    );
    const broken = 'texto-quebrado-com-um-dado-qualquer-12345';
    await visit(page, 0, '/sobre');
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key!, value!),
      [INSTALL_KEY, broken],
    );
    const errors = collectErrors(page);

    // Carga 1 (dia 1): o texto quebrado é ignorado (o estado volta ao zero), UM aviso sai e a visita regrava o valor.
    await visit(page, 1, '/sobre');
    await expect(anyInstallCard(page)).toHaveCount(0);
    const healed = await rawState(page);
    expect(healed).not.toBe(broken);
    expect(JSON.parse(healed!)).toMatchObject({ v: 1, visits: 1 });
    expect(errors.texts).toHaveLength(1);

    // Carga 2 (dia 2): sem aviso, a 2ª visita conta e o cartão aparece: o aparelho voltou a funcionar.
    await visit(page, 2, '/sobre');
    await expect(installCard(page)).toBeVisible();
    expect(errors.texts).toHaveLength(1);

    // Nunca o texto guardado nem a chave: só o nome do erro e do construtor.
    expect([...errors.texts, ...errors.dumps].join('\n')).not.toMatch(/texto-quebrado|ec:install/);
    expect(JSON.parse(errors.dumps[0]!)).toEqual([
      'cartão de instalação: leitura falhou',
      { name: 'SyntaxError', constructorName: 'SyntaxError' },
    ]);
  });

  // O guard é global e a exceção vale só para a mensagem exata de cada teste: qualquer outro `console.error` falha.
  test('o guard continua pegando OUTRO console.error mesmo com a exceção da leitura', async ({
    page,
    guard,
  }) => {
    test.fail();
    guard.allowConsole(readFailureMessage);
    await page.goto('/');
    await page.evaluate(() => console.error('outro problema qualquer'));
  });

  test('o guard continua pegando a mesma mensagem com a chave junto', async ({ page, guard }) => {
    test.fail();
    guard.allowConsole(readFailureMessage);
    await page.goto('/');
    await page.evaluate(
      (key) => console.error('cartão de instalação: leitura falhou', key),
      INSTALL_KEY,
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
test.describe('cartão de instalação: navegador embutido de aplicativo @mobile', () => {
  test.use({ ...IPHONE, userAgent: UA.iphoneInstagram });

  test.beforeEach(async ({ page }) => {
    await trackInstall(page);
  });

  test('o navegador do Instagram é classificado como "dentro de aplicativo"', async ({ page }) => {
    await page.goto('/');
    const device = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
    }));
    const platform = detectPlatform(device);
    expect(platform.family).toBe('ios-in-app');
    expect(installEligibility(platform)).toBe('hint');
  });

  test('mostra só a dica "abra no Safari", a partir da 2ª visita, e ela dá para dispensar', async ({
    page,
  }) => {
    await firstVisitDay0(page);
    await visit(page, 1, '/');
    const hint = installHint(page);
    await expect(hint).toBeVisible();
    await expect(hint).toHaveAttribute('data-install-card', 'hint');
    await expect(hint).toContainText(HINT_TEXT);
    await expect(hint.getByRole('button')).toHaveText(['Agora não']);
    // Nada dos passos nem do cartão.
    await expect(installCard(page)).toHaveCount(0);
    await expect(page.getByText('Toque em Compartilhar.')).toHaveCount(0);
    await expect(anyInstallCard(page)).toHaveCount(1);

    await hint.getByRole('button', { name: 'Agora não' }).click();
    await expect(anyInstallCard(page)).toHaveCount(0);
    await visit(page, 1, '/', { counts: false });
    await expect(anyInstallCard(page)).toHaveCount(0);
    await visit(page, 2, '/sobre');
    await expect(anyInstallCard(page)).toHaveCount(0);
  });

  test('a dica passa no axe, tem texto de 16px e alvo de toque de 44px', async ({
    page,
  }, testInfo) => {
    await firstVisitDay0(page);
    await visit(page, 1, '/sobre');
    await expect(installHint(page)).toBeVisible();
    await expectNoSeriousViolations(page, '/sobre com a dica');
    // O texto da dica e o do botão têm 16px ou mais.
    const sizes = await installHint(page).evaluate((root) =>
      Array.from(root.querySelectorAll<HTMLElement>('p, button')).map((el) =>
        parseFloat(getComputedStyle(el).fontSize),
      ),
    );
    expect(sizes).toHaveLength(2);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
    if (testInfo.project.name === 'webkit-mobile') {
      const box = await installHint(page).getByRole('button', { name: 'Agora não' }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(43.5);
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
    }
  });

  test('?instalacao=ver não mostra a dica na 1ª visita (a pré-visualização é só do cartão do Safari)', async ({
    page,
  }) => {
    await visit(page, 0, '/?instalacao=ver');
    await settle(page);
    await expect(anyInstallCard(page)).toHaveCount(0);
  });

  test('não mostra a seção "Instalar no iPhone" em /conta, mas /sobre informa para todos', async ({
    openAs,
  }) => {
    const { page } = await openAs(await createUser());
    await page.goto('/conta');
    await expect(page.getByRole('heading', { name: 'Excluir minha conta' })).toBeVisible();
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Instalar no iPhone' })).toHaveCount(0);
    await page.goto('/sobre');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Leia como aplicativo' }),
    ).toBeVisible();
  });
});

test.describe('cartão de instalação: Chrome do iPhone', () => {
  test.use({ ...IPHONE, userAgent: UA.iphoneChrome });

  test('nunca mostra o cartão nem a dica, e não conta visita', async ({ page }) => {
    await trackInstall(page);
    await visit(page, 0, '/sobre', { counts: false });
    await visit(page, 1, '/sobre', { counts: false });
    await visit(page, 2, '/sobre?instalacao=ver', { counts: false });
    await settle(page);
    await expect(anyInstallCard(page)).toHaveCount(0);
    expect(await cardWasSeen(page)).toBe(false);
    expect(await rawState(page)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
test.describe('cartão de instalação: Android', () => {
  test.use({
    userAgent: UA.androidChrome,
    viewport: { width: 412, height: 915 },
    hasTouch: true,
    isMobile: true,
  });

  test('nunca mostra o cartão, nem com ?instalacao=ver, e não conta visita', async ({ page }) => {
    await trackInstall(page);
    for (const [day, path] of [
      [0, '/'],
      [1, '/'],
      [2, '/sobre?instalacao=ver'],
    ] as const) {
      await visit(page, day, path, { counts: false });
      await settle(page);
      await expect(anyInstallCard(page)).toHaveCount(0);
    }
    expect(await cardWasSeen(page)).toBe(false);
    expect(await rawState(page)).toBeNull();
    // /sobre informa para todos, inclusive no Android.
    await expect(
      page.getByRole('heading', { level: 2, name: 'Leia como aplicativo' }),
    ).toBeVisible();
  });

  test('/conta não tem "Instalar no iPhone" no Android', async ({ openAs }) => {
    const { page } = await openAs(await createUser());
    await page.goto('/conta');
    await expect(page.getByRole('heading', { name: 'Excluir minha conta' })).toBeVisible();
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Instalar no iPhone' })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
test.describe('cartão de instalação: computador', () => {
  // Sem `test.use`: o agente de usuário de computador do projeto (Chrome ou Safari de mesa).

  test('nunca mostra o cartão, nem com ?instalacao=ver, e não conta visita', async ({ page }) => {
    await trackInstall(page);
    for (const [day, path] of [
      [0, '/'],
      [1, '/'],
      [2, '/sobre?instalacao=ver'],
      [3, '/estante'],
    ] as const) {
      await visit(page, day, path, { counts: false });
      await settle(page);
      await expect(anyInstallCard(page), path).toHaveCount(0);
    }
    expect(await cardWasSeen(page)).toBe(false);
    expect(await rawState(page)).toBeNull();
  });

  test('/sobre mostra a seção informativa "Leia como aplicativo" para o visitante', async ({
    page,
  }) => {
    await page.goto('/sobre');
    const section = page.locator('#app');
    await expect(
      section.getByRole('heading', { level: 2, name: 'Leia como aplicativo' }),
    ).toBeVisible();
    await expectGuide(section);
  });

  test('/conta não tem "Instalar no iPhone" no computador', async ({ openAs }) => {
    const { page } = await openAs(await createUser());
    await page.goto('/conta');
    await expect(page.getByRole('heading', { name: 'Excluir minha conta' })).toBeVisible();
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Instalar no iPhone' })).toHaveCount(0);
  });

  test('o painel nunca mostra o cartão no computador (administração e moderação)', async ({
    openAs,
  }) => {
    const admin = await openAs(await createAdmin());
    await trackInstall(admin.context);
    await admin.page.goto('/painel');
    await expect(
      admin.page.getByRole('heading', { name: 'Indicadores e atividade' }),
    ).toBeVisible();
    await settle(admin.page);
    await expect(anyInstallCard(admin.page)).toHaveCount(0);
    expect(await cardWasSeen(admin.page)).toBe(false);

    const moderator = await openAs(await createModerator());
    await trackInstall(moderator.context);
    await moderator.page.goto('/painel/comentarios');
    await expect(
      moderator.page.getByRole('navigation', { name: 'Estado dos comentários' }),
    ).toBeVisible();
    await settle(moderator.page);
    await expect(anyInstallCard(moderator.page)).toHaveCount(0);
    expect(await cardWasSeen(moderator.page)).toBe(false);
  });
});
