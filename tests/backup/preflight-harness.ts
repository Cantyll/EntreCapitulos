import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, expect } from 'vitest';

import { parseRecords, type PreflightRecord } from '../../scripts/backup/lib.mjs';

/*
 * preflight.sh de ponta a ponta, com `aws`, `supabase` e `psql` FALSOS que imprimem erros no formato das
 * ferramentas reais, SEMPRE misturados a segredos, e-mail e linhas de dado. O gpg é o de verdade.
 * Prova: todas as verificações rodam, o resultado sai em texto fixo, nada vaza para o log nem para o
 * resumo, e a escrita no R2 nunca acontece onde não deve.
 */
export const ROOT = process.cwd();

export const SECRETS = {
  R2_ACCOUNT_ID: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  R2_ACCESS_KEY_ID: 'f0e1d2c3b4a5968778695a4b3c2d1e0f',
  R2_SECRET_ACCESS_KEY: '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0',
  R2_BUCKET: 'entre-capitulos-backup',
  BACKUP_PASSPHRASE: 'frase-secreta-de-teste-0987654321',
  SUPABASE_ACCESS_TOKEN: `sbp_${'0123456789abcdef'.repeat(2)}01234567`,
  SUPABASE_DB_PASSWORD: 'senha-do-banco-de-teste!42',
  SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  RESTORE_TARGET_PROJECT_REF: 'tsrqponmlkjihgfedcba',
  RESTORE_TARGET_DB_PASSWORD: 'senha-do-destino-de-teste!7',
};
export const BACKUP_SECRETS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'BACKUP_PASSPHRASE',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_PROJECT_REF',
] as const;
export const EMAIL = 'fulana-de-teste@exemplo.test';
export const NOISE_MARKER = 'RUIDO-DA-FERRAMENTA-xyz';
export const OTHER_PASSPHRASE = 'outra-frase-que-nao-abre-o-backup-1';
export const DAILY_KEY = 'daily/2026-10-03.tar.gpg';
export const WEEKLY_KEY = 'weekly/2026-09-27.tar.gpg';

export const procEnv = (vars: Record<string, string>) => vars as NodeJS.ProcessEnv;

// aws falso. Registra só a operação e a chave/prefixo (nunca credenciais) em $FAKE_LOG.
const FAKE_AWS = `#!/usr/bin/env bash
op=""; key=""; prefix=""; endpoint=""
args=("$@")
for ((i = 0; i < \${#args[@]}; i++)); do
  case "\${args[i]}" in
    list-objects-v2|put-object|delete-object|get-object|copy-object|head-object) op="\${args[i]}" ;;
    --key) key="\${args[i + 1]}" ;;
    --prefix) prefix="\${args[i + 1]}" ;;
    --endpoint-url) endpoint="\${args[i + 1]}" ;;
  esac
done
last="\${args[\${#args[@]} - 1]}"
printf '%s %s\\n' "$op" "\${key:-$prefix}" >>"$FAKE_LOG"
case "$op" in
  list-objects-v2) name=ListObjectsV2 ;; put-object) name=PutObject ;; delete-object) name=DeleteObject ;;
  get-object) name=GetObject ;; *) name=Other ;;
esac
noise() { printf '%s %s %s COPY "auth"."users" (id) FROM stdin; %s\\n' "$AWS_SECRET_ACCESS_KEY" "$AWS_ACCESS_KEY_ID" "${EMAIL}" "${NOISE_MARKER}"; }
fail() { printf '\\nAn error occurred (%s) when calling the %s operation: Mensagem da ferramenta. %s\\n' "$1" "$name" "$(noise)" >&2; exit "\${2:-254}"; }
if [ "$endpoint" != "$FAKE_EXPECT_ENDPOINT" ]; then
  printf 'Could not connect to the endpoint URL: "%s/x" %s\\n' "$endpoint" "$(noise)" >&2; exit 255
fi
[ "$AWS_ACCESS_KEY_ID" = "$FAKE_EXPECT_KEY" ] || fail InvalidAccessKeyId
[ "$AWS_SECRET_ACCESS_KEY" = "$FAKE_EXPECT_SECRET" ] || fail SignatureDoesNotMatch
case "$op" in
  list-objects-v2)
    case "\${FAKE_AWS_LIST:-ok}" in
      no_bucket) fail NoSuchBucket ;; denied) fail AccessDenied ;; service) fail ServiceUnavailable ;;
      unknown) fail SomethingNew ;; weird) printf 'erro estranho sem estrutura %s\\n' "$(noise)" >&2; exit 1 ;;
    esac
    case "$prefix" in
      daily/*) if [ -n "\${FAKE_DAILY_JSON:-}" ]; then cat "$FAKE_DAILY_JSON"; else echo null; fi ;;
      weekly/*) if [ -n "\${FAKE_WEEKLY_JSON:-}" ]; then cat "$FAKE_WEEKLY_JSON"; else echo null; fi ;;
      *) echo '{}' ;;
    esac ;;
  put-object) [ "\${FAKE_AWS_PUT:-ok}" = ok ] || fail AccessDenied; echo '{}' ;;
  delete-object) [ "\${FAKE_AWS_DELETE:-ok}" = ok ] || fail AccessDenied; echo '{}' ;;
  get-object)
    case "$key" in
      daily/*) cp "$FAKE_DAILY_GPG" "$last" ;;
      weekly/*) cp "$FAKE_WEEKLY_GPG" "$last" ;;
    esac
    echo '{}' ;;
  *) fail InvalidRequest ;;
esac
`;

// supabase falso: erros no formato JSON da CLI 2.118 e sempre com ruído (segredos, e-mail, dado).
const FAKE_SUPABASE = `#!/usr/bin/env bash
noise() { printf 'token=%s senha=%s %s COPY "auth"."users" FROM stdin; %s\\n' "$SUPABASE_ACCESS_TOKEN" "$SUPABASE_DB_PASSWORD" "${EMAIL}" "${NOISE_MARKER}"; }
err() { printf '{"_tag":"Error","error":{"code":"%s","message":"%s"}}\\n' "$1" "$2"; noise; exit 1; }
if [ "$1" = "--version" ]; then echo 2.118.0; exit 0; fi
case "$1 $2" in
  "projects list")
    echo "supabase projects list" >>"$FAKE_LOG"
    case "\${FAKE_SB_TOKEN:-ok}" in
      ok) echo "NOME  ID" ;;
      invalid) err ProjectsListUnexpectedStatusError 'Unexpected error retrieving projects: {\\"message\\":\\"Unauthorized\\"}' ;;
      network) printf 'dial tcp: lookup api.supabase.com: no such host\\n'; noise; exit 1 ;;
    esac ;;
  "link --project-ref")
    echo "supabase link" >>"$FAKE_LOG"
    case "\${FAKE_SB_PROJECT:-ok}" in
      ok) mkdir -p supabase/.temp; echo "postgresql://postgres.abc@pooler.exemplo:5432/postgres" >supabase/.temp/pooler-url; echo linked ;;
      unknown) err LinkProjectStatusError 'Unexpected error retrieving remote project status: {\\"message\\":\\"Forbidden\\"}' ;;
    esac ;;
  "db dump")
    echo "supabase db dump \${*:3}" >>"$FAKE_LOG"
    file=""; args=("$@")
    for ((i = 0; i < \${#args[@]}; i++)); do [ "\${args[i]}" = "-f" ] && file="\${args[i + 1]}"; done
    case "\${FAKE_SB_DB:-ok}" in
      ok) echo "CREATE ROLE ${NOISE_MARKER};" >"$file" ;;
      password) err DockerRunError 'failed to connect to postgres: failed SASL auth (FATAL: password authentication failed for user \\"postgres\\" (SQLSTATE 28P01))' ;;
      network) printf 'failed to connect: dial error (dial tcp 1.2.3.4:5432: i/o timeout)\\n'; noise; exit 1 ;;
      unknown) err NovoErroDaCli 'algo novo' ;;
    esac ;;
  *) echo "supabase $*" >>"$FAKE_LOG"; exit 0 ;;
esac
`;

const FAKE_PSQL = `#!/usr/bin/env bash
echo "psql" >>"$FAKE_LOG"
if [ "\${FAKE_PSQL:-ok}" = password ]; then
  printf 'psql: error: connection to server at "pooler.exemplo" failed: FATAL:  password authentication failed for user "postgres.abc" %s %s\\n' "$PGPASSWORD" "${EMAIL}" >&2
  exit 2
fi
echo 1
`;

// jq falso que quebra só na leitura do prefixo do pré-verificador (simula um erro inesperado).
const fakeJqCrash = (realJq: string) => `#!/usr/bin/env bash
case "$*" in *.preflight.prefix*) exit 7 ;; esac
exec ${realJq} "$@"
`;

let tmp: string;
let bin: string;
export let crashBin: string;
let counter = 0;
export const fixtures: Record<string, string> = {};

function encrypt(passphrase: string, out: string) {
  const plain = join(tmp, 'plain.txt');
  writeFileSync(plain, 'conteudo sintetico do backup\n');
  const result = spawnSync(
    'bash',
    [
      '-c',
      'printf %s "$P" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 --symmetric --cipher-algo AES256 --s2k-count 65536 --output "$OUT" "$IN"',
    ],
    {
      env: procEnv({ PATH: process.env.PATH ?? '', HOME: tmp, P: passphrase, OUT: out, IN: plain }),
    },
  );
  expect(result.status).toBe(0);
}

function setup() {
  tmp = mkdtempSync(join(tmpdir(), 'preflight-test-'));
  bin = join(tmp, 'bin');
  crashBin = join(tmp, 'crash-bin');
  mkdirSync(bin);
  mkdirSync(crashBin);
  for (const [name, body] of [
    ['aws', FAKE_AWS],
    ['supabase', FAKE_SUPABASE],
    ['psql', FAKE_PSQL],
  ] as const) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const realJq = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).stdout.trim();
  expect(realJq).not.toBe('');
  writeFileSync(join(crashBin, 'jq'), fakeJqCrash(realJq));
  chmodSync(join(crashBin, 'jq'), 0o755);

  fixtures.dailyGood = join(tmp, 'daily-good.gpg');
  fixtures.dailyOther = join(tmp, 'daily-other.gpg');
  fixtures.weeklyGood = join(tmp, 'weekly-good.gpg');
  encrypt(SECRETS.BACKUP_PASSPHRASE, fixtures.dailyGood);
  encrypt(OTHER_PASSPHRASE, fixtures.dailyOther);
  encrypt(SECRETS.BACKUP_PASSPHRASE, fixtures.weeklyGood);
  const listing = (key: string) =>
    JSON.stringify([{ key, size: 100, lastModified: '2026-10-03T06:30:00Z' }]);
  fixtures.dailyJson = join(tmp, 'daily.json');
  fixtures.weeklyJson = join(tmp, 'weekly.json');
  writeFileSync(fixtures.dailyJson, listing(DAILY_KEY));
  writeFileSync(fixtures.weeklyJson, listing(WEEKLY_KEY));
}

function teardown() {
  rmSync(tmp, { recursive: true, force: true });
}

/** Registra a preparação (shims, backups de teste) e a limpeza no arquivo de teste que a chamar. */
export function installHarness() {
  beforeAll(setup);
  afterAll(teardown);
}

/** Pasta temporária e PATH com os shims, para quem precisa montar o ambiente à mão. */
export const harnessPaths = () => ({ tmp, bin });

export type Overrides = Record<string, string | undefined>;

export interface Run {
  status: number | null;
  output: string;
  dir: string;
  cwd: string;
  records: PreflightRecord[];
  calls: string[];
  summary: () => string;
}

/** Roda preflight.sh num diretório isolado (cwd com atalhos para scripts/ e .github/). */
export function prepare(overrides: Overrides = {}) {
  counter += 1;
  const dir = join(tmp, `run-${counter}`);
  const cwd = join(dir, 'cwd');
  mkdirSync(cwd, { recursive: true });
  symlinkSync(join(ROOT, 'scripts'), join(cwd, 'scripts'));
  symlinkSync(join(ROOT, '.github'), join(cwd, '.github'));
  const log = join(dir, 'calls.log');
  writeFileSync(log, '');
  const base: Overrides = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: tmp,
    RUNNER_TEMP: dir,
    FAKE_LOG: log,
    GITHUB_RUN_ID: '12345',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_EVENT_NAME: 'schedule',
    FAKE_EXPECT_ENDPOINT: `https://${SECRETS.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    FAKE_EXPECT_KEY: SECRETS.R2_ACCESS_KEY_ID,
    FAKE_EXPECT_SECRET: SECRETS.R2_SECRET_ACCESS_KEY,
    FAKE_DAILY_GPG: fixtures.dailyGood,
    FAKE_WEEKLY_GPG: fixtures.weeklyGood,
    EMAIL,
    NOISE_MARKER,
    ...SECRETS,
  };
  const merged = { ...base, ...overrides };
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) if (value !== undefined) env[key] = value;
  return { dir, cwd, env, log };
}

/** Roda preflight.sh num diretório isolado (cwd com atalhos para scripts/ e .github/). */
export function run(scope: string, overrides: Overrides = {}): Run {
  const { dir, cwd, env, log } = prepare(overrides);
  const result = spawnSync('bash', ['scripts/backup/preflight.sh', scope], {
    cwd,
    env: procEnv(env),
    encoding: 'utf8',
  });
  const resultsFile = join(dir, 'preflight', 'results.jsonl');
  const records = existsSync(resultsFile)
    ? parseRecords(readFileSync(resultsFile, 'utf8')).records
    : [];
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    dir,
    cwd,
    records,
    calls: readFileSync(log, 'utf8').split('\n').filter(Boolean),
    summary: () => {
      const file = join(dir, 'summary.md');
      const summary = spawnSync('bash', ['scripts/backup/preflight-summary.sh', scope], {
        cwd,
        env: procEnv({ ...env, GITHUB_STEP_SUMMARY: file }),
        encoding: 'utf8',
      });
      return `${readFileSync(file, 'utf8')}${summary.stdout}${summary.stderr}`;
    },
  };
}

export const byItem = (r: Run, item: string) => r.records.find((record) => record.item === item);

/** Nada de segredo (inteiro ou em pedaços de 12), e-mail, dado ou ruído da ferramenta num texto de log. */
export function expectNoLeak(text: string, extraSecrets: string[] = []) {
  // As linhas ::add-mask:: são comandos que o runner consome e que escondem o valor derivado (o aparado).
  const visible = text
    .split('\n')
    .filter((line) => !line.startsWith('::add-mask::'))
    .join('\n')
    // O texto fixo "formato esperado" cita o prefixo público do token (não é o valor de nenhum segredo).
    .replaceAll('começa com sbp_ e tem', 'começa com o prefixo e tem');
  for (const value of [...Object.values(SECRETS), ...extraSecrets]) {
    expect(visible).not.toContain(value);
    for (let i = 0; i + 12 <= value.length; i += 1) {
      expect(visible).not.toContain(value.slice(i, i + 12));
    }
  }
  for (const marker of [EMAIL, NOISE_MARKER, 'COPY "auth"', 'Mensagem da ferramenta', 'eco:']) {
    expect(visible).not.toContain(marker);
  }
  expect(visible).not.toMatch(/[0-9a-f]{20,}/i);
  expect(visible).not.toMatch(/sbp_/i);
}

export function expectNoLeftovers(r: Run) {
  // Só o arquivo de resultados (texto fixo) sobra; texto puro, frase e saídas das ferramentas somem.
  expect(readdirSync(join(r.dir, 'preflight'))).toEqual(['results.jsonl']);
}
