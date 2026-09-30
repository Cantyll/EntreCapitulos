import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // Precisa ficar por último: desliga regras de estilo que brigam com o Prettier.
  prettier,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'docs/**', 'next-env.d.ts']),
]);
