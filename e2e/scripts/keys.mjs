// Lê as chaves do Supabase LOCAL em tempo de execução (`supabase status`). Elas ficam só em
// e2e/.tmp/keys.json (fora do git) e na memória; nada disso entra no repositório.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TMP_DIR } from './certs.mjs';

const KEYS_PATH = join(TMP_DIR, 'keys.json');

export function readStatus() {
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: {
      ...process.env,
      SUPABASE_INTERNAL_IMAGE_REGISTRY: process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY ?? 'docker.io',
    },
  });
  const json = JSON.parse(out.slice(out.indexOf('{')));
  return {
    apiUrl: json.API_URL,
    publishableKey: json.PUBLISHABLE_KEY,
    secretKey: json.SECRET_KEY,
    mailpitUrl: json.MAILPIT_URL ?? json.INBUCKET_URL,
  };
}

export function saveKeys(keys) {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(KEYS_PATH, JSON.stringify(keys), { mode: 0o600 });
}

export function loadKeys() {
  return JSON.parse(readFileSync(KEYS_PATH, 'utf8'));
}
