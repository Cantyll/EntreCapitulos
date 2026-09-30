import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // A chave service_role / secret nunca entra no app: o RLS é que protege os dados.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/service_role|sb_secret|SUPABASE_SERVICE|SUPABASE_SECRET/i]',
          message: 'Não use a chave service_role/secret do Supabase no app.',
        },
        {
          selector: 'Identifier[name=/service_?role|SUPABASE_SECRET/i]',
          message: 'Não use a chave service_role/secret do Supabase no app.',
        },
      ],
    },
  },
  // Precisa ficar por último: desliga regras de estilo que brigam com o Prettier.
  prettier,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'docs/**', 'next-env.d.ts']),
]);
