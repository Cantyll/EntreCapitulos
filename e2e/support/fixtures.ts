import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';

import { createUser, signIn, type CreateUserOptions, type TestUser } from './users';

/** O que a fixture global aceita de propósito (por teste). */
export type Guard = {
  /** Respostas 4xx esperadas (404, 403): o Chromium as registra no console como "Failed to load resource". */
  allowStatus: (...statuses: number[]) => void;
  /** Mensagens de console esperadas (texto exato ou regex). */
  allowConsole: (...patterns: (string | RegExp)[]) => void;
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

export const test = base.extend<Fixtures>({
  guard: [
    async ({ context }, use) => {
      const problems: string[] = [];
      const allowedStatuses = new Set<number>();
      const allowedConsole: (string | RegExp)[] = [];

      await context.exposeFunction(CSP_BINDING, (info: string) => {
        problems.push(`violação de CSP: ${info}`);
      });
      await context.addInitScript((binding) => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const report = (window as unknown as Record<string, (info: string) => void>)[binding];
          report?.(`${event.violatedDirective} bloqueou ${event.blockedURI || 'inline'}`);
        });
      }, CSP_BINDING);

      const watch = (page: Page) => {
        page.on('console', (message) => {
          if (message.type() !== 'error') return;
          const text = message.text();
          if (allowedStatuses.size && /Failed to load resource/.test(text)) return;
          if (allowedConsole.some((p) => (typeof p === 'string' ? text.includes(p) : p.test(text))))
            return;
          problems.push(`console.error: ${text}`);
        });
        page.on('pageerror', (error) => problems.push(`erro não tratado: ${error.message}`));
        page.on('response', (response) => {
          if (response.status() >= 500)
            problems.push(`resposta ${response.status()}: ${new URL(response.url()).pathname}`);
        });
      };
      for (const page of context.pages()) watch(page);
      context.on('page', watch);

      await use({
        allowStatus: (...statuses) => statuses.forEach((s) => allowedStatuses.add(s)),
        allowConsole: (...patterns) => allowedConsole.push(...patterns),
      });

      expect(problems, 'CSP, console e respostas 5xx').toEqual([]);
    },
    { auto: true },
  ],

  openAs: async ({ browser, contextOptions, guard }, use) => {
    void guard;
    const opened: BrowserContext[] = [];
    await use(async (user) => {
      const context = await browser.newContext(contextOptions);
      opened.push(context);
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
