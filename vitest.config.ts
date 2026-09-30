import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Só a lógica pura (login, papéis, nome público). Os fluxos de tela ficam para o Playwright.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
