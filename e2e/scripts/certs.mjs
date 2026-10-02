// Certificado autoassinado só para o teste local (localhost). Gerado em e2e/.tmp, nunca versionado.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TMP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp');
export const KEY_PATH = join(TMP_DIR, 'key.pem');
export const CERT_PATH = join(TMP_DIR, 'cert.pem');

export function ensureCert() {
  mkdirSync(TMP_DIR, { recursive: true });
  if (existsSync(KEY_PATH) && existsSync(CERT_PATH)) return;
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '7',
      '-keyout',
      KEY_PATH,
      '-out',
      CERT_PATH,
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
}
