import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke test do site em produção: SOMENTE LEITURA, sem login e sem nenhum secret. Roda por
 * `.github/workflows/smoke-prod.yml`. `SMOKE_BASE_URL` troca o endereço (por exemplo para conferir o
 * mesmo teste contra o ambiente local); `SMOKE_INSECURE=1` aceita o certificado autoassinado local.
 */
/** Só para conferir daqui de uma sessão com proxy de saída: `SMOKE_PROXY=$HTTPS_PROXY SMOKE_INSECURE=1`. */
function proxyFromEnv() {
  const raw = process.env.SMOKE_PROXY;
  if (!raw) return undefined;
  const url = new URL(raw);
  return {
    server: `${url.protocol}//${url.host}`,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

export default defineConfig({
  testDir: 'e2e/smoke',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? 'https://www.entrecapitulos.blog.br',
    ignoreHTTPSErrors: process.env.SMOKE_INSECURE === '1',
    proxy: proxyFromEnv(),
    locale: 'pt-BR',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'producao', use: { ...devices['Desktop Chrome'] } }],
});
