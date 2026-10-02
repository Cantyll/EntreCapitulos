// Build de PRODUÇÃO do app apontando para o Supabase local atrás do proxy HTTPS (a regra de https
// da etapa 2.1 continua valendo: o app nunca recebe uma URL http de Supabase em produção).
import { spawnSync } from 'node:child_process';

import { readStatus, saveKeys } from './keys.mjs';

export const SUPABASE_TLS_URL = 'https://localhost:54443';

const keys = readStatus();
saveKeys(keys);

const result = spawnSync('npx', ['next', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_TLS_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keys.publishableKey,
  },
});
process.exit(result.status ?? 1);
