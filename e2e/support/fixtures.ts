import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';

import { createUser, signIn, type CreateUserOptions, type TestUser } from './users';

/** O que a fixture global aceita de propósito (por teste). */
export type Guard = {
  /** Respostas 4xx esperadas (404, 403): o Chromium as registra no console como "Failed to load resource". */
  allowStatus: (...statuses: number[]) => void;
  /** Mensagens de console esperadas (texto exato ou regex). */
  allowConsole: (...patterns: (string | RegExp)[]) => void;
  /**
   * Coloca um contexto criado pelo teste (`browser.newContext`) sob a mesma vigia do contexto padrão: CSP,
   * `console.error`, erro não tratado e resposta 5xx entram na mesma lista de problemas. `openAs` e `signedIn`
   * já chamam isto; quem abrir um contexto à mão precisa chamar antes de abrir a primeira página.
   */
  watchContext: (context: BrowserContext) => Promise<void>;
};

type Fixtures = {
  guard: Guard;
  /** Cria um usuário, entra com ele num contexto novo e devolve a página. */
  signedIn: (
    options?: CreateUserOptions,
  ) => Promise<{ page: Page; context: BrowserContext; user: TestUser }>;
  /** Entra com um usuário já criado num contexto novo. */
  openAs: (user: TestUser) => Promise<{ page: Page; context: BrowserContext }>;
};

const CSP_BINDING = '__reportCspViolation';

/**
 * O WebKit relata como erro não tratado uma busca de prefetch do `<Link>` (`?_rsc=…` ou `&_rsc=…`) que a navegação, ou o fechamento
 * do contexto, cancelou no meio ("… due to access control checks."). Não é defeito do site: acontece em qualquer
 * página com links quando a pessoa sai dela. Só esse formato exato é ignorado; qualquer outro erro não tratado
 * continua falhando o teste.
 */
const ABORTED_PREFETCH = /[?&]_rsc=[A-Za-z0-9_-]+ due to access control checks\.?$/;

export const test = base.extend<Fixtures>({
  guard: [
    async ({ context }, use) => {
      const problems: string[] = [];
      const allowedStatuses = new Set<number>();
      const allowedConsole: (string | RegExp)[] = [];

      const watchPage = (page: Page) => {
        page.on('console', (message) => {
          if (message.type() !== 'error') return;
          const text = message.text();
          if (allowedStatuses.size && /Failed to load resource/.test(text)) return;
          if (allowedConsole.some((p) => (typeof p === 'string' ? text.includes(p) : p.test(text))))
            return;
          problems.push(`console.error: ${text}`);
        });
        page.on('pageerror', (error) => {
          if (ABORTED_PREFETCH.test(error.message)) return;
          problems.push(`erro não tratado: ${error.message}`);
        });
        page.on('response', (response) => {
          if (response.status() >= 500)
            problems.push(`resposta ${response.status()}: ${new URL(response.url()).pathname}`);
        });
      };

      const watchContext = async (target: BrowserContext) => {
        await target.exposeFunction(CSP_BINDING, (info: string) => {
          problems.push(`violação de CSP: ${info}`);
        });
        await target.addInitScript((binding) => {
          document.addEventListener('securitypolicyviolation', (event) => {
            const report = (window as unknown as Record<string, (info: string) => void>)[binding];
            report?.(`${event.violatedDirective} bloqueou ${event.blockedURI || 'inline'}`);
          });
        }, CSP_BINDING);
        for (const page of target.pages()) watchPage(page);
        target.on('page', watchPage);
      };

      await watchContext(context);

      await use({
        allowStatus: (...statuses) => statuses.forEach((s) => allowedStatuses.add(s)),
        allowConsole: (...patterns) => allowedConsole.push(...patterns),
        watchContext,
      });

      expect(problems, 'CSP, console e respostas 5xx').toEqual([]);
    },
    { auto: true },
  ],

  openAs: async ({ browser, contextOptions, guard }, use) => {
    const opened: BrowserContext[] = [];
    await use(async (user) => {
      const context = await browser.newContext(contextOptions);
      opened.push(context);
      // Sem isto o contexto novo ficava fora da vigia (CSP, console, 5xx) e `allowStatus` não valia nele.
      await guard.watchContext(context);
      await signIn(context, user);
      return { context, page: await context.newPage() };
    });
    await Promise.all(opened.map((c) => c.close()));
  },

  signedIn: async ({ openAs }, use) => {
    await use(async (options) => {
      const user = await createUser(options);
      return { ...(await openAs(user)), user };
    });
  },
});

export { expect };
