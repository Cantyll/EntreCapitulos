import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const APP_URL = 'https://localhost:3443';
export const DB_CONTAINER = 'supabase_db_entre-capitulos';

type Keys = { apiUrl: string; publishableKey: string; secretKey: string; mailpitUrl: string };

let cached: Keys | undefined;

/** Chaves do Supabase LOCAL, gravadas em e2e/.tmp (fora do git) pelo script que sobe o ambiente. */
export function keys(): Keys {
  cached ??= JSON.parse(readFileSync(join(__dirname, '..', '.tmp', 'keys.json'), 'utf8')) as Keys;
  return cached;
}
