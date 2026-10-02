import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

/**
 * E2E contra um build de PRODUÇÃO (next start) e o Supabase local, ambos atrás de HTTPS local
 * (ver e2e/scripts/serve.mjs). `ignoreHTTPSErrors` vale só aqui, no navegador de teste.
 *
 * WebKit é o motor do Safari, mas NÃO é o Safari real nem o app instalado da Tela de Início.
 */
export default defineConfig({
  testDir: 'e2e/tests',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'https://localhost:3443',
    ignoreHTTPSErrors: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  globalSetup: './e2e/setup/world.ts',
  webServer: {
    command: 'node e2e/scripts/serve.mjs',
    // Não toca no banco: o cache de dados do app só pode ser preenchido depois do globalSetup.
    url: 'https://localhost:3443/manifest.webmanifest',
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /serial\.spec\.ts$/,
    },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /serial\.spec\.ts$/,
    },
    {
      name: 'webkit-mobile',
      use: { ...devices['iPhone 17'] },
      grep: /@mobile/,
      testIgnore: /serial\.spec\.ts$/,
    },
    {
      // Fluxos que mexem no estado GLOBAL do banco (só um livro "em leitura", numeração das sessões):
      // rodam em série e só depois dos outros projetos, para não pisar neles.
      name: 'chromium-admin',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /serial\.spec\.ts$/,
      fullyParallel: false,
      workers: 1,
      dependencies: ['chromium-desktop', 'webkit-desktop', 'webkit-mobile'],
    },
    {
      // O mesmo estado global, agora no WebKit do iPhone: só os specs `*.mobile-serial.spec.ts`, depois do grupo do Chromium.
      name: 'webkit-mobile-admin',
      use: { ...devices['iPhone 17'] },
      testMatch: /mobile-serial\.spec\.ts$/,
      fullyParallel: false,
      workers: 1,
      dependencies: ['chromium-admin'],
    },
  ],
});
