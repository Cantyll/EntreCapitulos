// Sobe o ambiente de teste: dois proxies HTTPS (Supabase em 54443, app em 3443) e `next start`.
// Só para testes. O app roda como em produção (NODE_ENV=production, build já feito) e confia no
// certificado local por NODE_EXTRA_CA_CERTS: a verificação TLS do servidor NÃO é desligada.
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

import { CERT_PATH, KEY_PATH, ensureCert } from './certs.mjs';
import { readStatus, saveKeys } from './keys.mjs';

const APP_PORT = 3000;
const APP_TLS_PORT = 3443;
const SUPABASE_TLS_PORT = 54443;

ensureCert();
// O cache de dados do Next também vive em disco: sem limpar, uma rodada anterior deixaria dados velhos.
rmSync('.next/cache/fetch-cache', { recursive: true, force: true });
const keys = readStatus();
saveKeys(keys);

const tls = { key: readFileSync(KEY_PATH), cert: readFileSync(CERT_PATH) };

function proxy({ listen, target, publicOrigin, targetOrigins }) {
  const server = https.createServer(tls, (req, res) => {
    const up = http.request(
      {
        host: '127.0.0.1',
        port: target,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          'x-forwarded-proto': 'https',
          'x-forwarded-host': req.headers.host,
        },
      },
      (pr) => {
        const headers = { ...pr.headers };
        for (const name of ['location', 'x-action-redirect']) {
          if (typeof headers[name] !== 'string') continue;
          for (const origin of targetOrigins) {
            headers[name] = headers[name].replace(origin, publicOrigin);
          }
        }
        res.writeHead(pr.statusCode ?? 502, headers);
        pr.pipe(res);
      },
    );
    up.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  });
  server.listen(listen);
  return server;
}

const servers = [
  proxy({
    listen: SUPABASE_TLS_PORT,
    target: 54321,
    publicOrigin: `https://localhost:${SUPABASE_TLS_PORT}`,
    targetOrigins: [/^https?:\/\/(127\.0\.0\.1|localhost):54321/],
  }),
  proxy({
    listen: APP_TLS_PORT,
    target: APP_PORT,
    publicOrigin: `https://localhost:${APP_TLS_PORT}`,
    targetOrigins: [new RegExp(`^https?:\\/\\/(127\\.0\\.0\\.1|localhost):${APP_PORT}`)],
  }),
];

const app = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NODE_EXTRA_CA_CERTS: CERT_PATH,
    NEXT_PUBLIC_SUPABASE_URL: `https://localhost:${SUPABASE_TLS_PORT}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keys.publishableKey,
  },
});

function stop() {
  for (const s of servers) s.close();
  app.kill('SIGTERM');
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
app.on('exit', (code) => process.exit(code ?? 0));
