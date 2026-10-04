// Ponto de entrada dos scripts .sh: chama a lógica pura de lib.mjs. Nunca imprime linha de dado.
// Todo erro sai como mensagem fixa em pt-BR (BackupError) ou só com o nome do erro.
import {
  appendFileSync,
  createReadStream,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { createInterface } from 'node:readline';

import {
  BackupError,
  buildManifest,
  checkAge,
  checkSize,
  checkTables,
  SCOPES,
  SECRET_NAMES,
  classify,
  compareCounts,
  countCopyRows,
  evaluatePreflight,
  extractIdentifier,
  formatRecord,
  internalFailure,
  isScope,
  latestEntry,
  parseBackupChoice,
  parseRecords,
  preflightAnnotations,
  preflightLogLines,
  previousEntry,
  renderPreflightMissing,
  renderPreflightSummary,
  sanitizeRecord,
  sha256,
  validateManifest,
} from './lib.mjs';

const CONFIG_PATH = process.env.BACKUP_CONFIG ?? '.github/backup.config.json';
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const [command, ...args] = process.argv.slice(2);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// --- Pré-verificação das credenciais -----------------------------------------------------------

function resultsPath() {
  const dir = process.env.PREFLIGHT_DIR;
  if (!dir) throw new BackupError('PREFLIGHT_DIR não está definida.');
  return `${dir}/results.jsonl`;
}

function appendRecord(record) {
  const safe = sanitizeRecord(record);
  if (!safe) throw new BackupError('Registro de pré-verificação inválido.');
  appendFileSync(resultsPath(), `${JSON.stringify(safe)}\n`);
}

/** Valores dos segredos (crus e sem espaços nas pontas): usados só para recusar um identificador parecido. */
function secretValues() {
  const values = [];
  for (const name of SECRET_NAMES) {
    const value = process.env[name];
    if (typeof value === 'string' && value !== '') values.push(value, value.trim());
  }
  return values;
}

function textOptions() {
  return { passphraseMinLength: config.preflight?.passphraseMinLength };
}

function requireScope(name) {
  if (!isScope(name)) throw new BackupError('Escopo da pré-verificação desconhecido.');
  return name;
}

function evaluateFromFile(scope) {
  const { records, invalid } = parseRecords(readFileSync(resultsPath(), 'utf8'));
  return evaluatePreflight(records, scope, { invalid });
}

async function run() {
  switch (command) {
    case 'counts': {
      const [dataFile, out] = args;
      const lines = createInterface({ input: createReadStream(dataFile), crlfDelay: Infinity });
      const collected = [];
      for await (const line of lines) collected.push(line);
      writeFileSync(out, JSON.stringify(countCopyRows(collected)));
      return;
    }
    case 'check-tables': {
      checkTables(readJson(args[0]), config);
      return;
    }
    case 'manifest': {
      const [stage, out] = args;
      const files = {};
      for (const name of ['roles.sql', 'schema.sql', 'data.sql']) {
        files[name] = sha256(readFileSync(`${stage}/${name}`));
      }
      const counts = readJson(`${stage}/counts.json`);
      const manifest = buildManifest({
        createdAt: new Date().toISOString(),
        cliVersion: process.env.CLI_VERSION ?? '',
        repoLatestMigration: process.env.REPO_LATEST_MIGRATION ?? '',
        counts,
        files,
      });
      writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
      rmSync(`${stage}/counts.json`);
      return;
    }
    case 'verify-manifest': {
      const dir = args[0];
      const manifest = readJson(`${dir}/manifest.json`);
      validateManifest(manifest);
      for (const [name, hash] of Object.entries(manifest.files)) {
        if (sha256(readFileSync(`${dir}/${name}`)) !== hash) {
          throw new BackupError(`O arquivo ${name} do backup não bate com o SHA-256 do manifesto.`);
        }
      }
      return;
    }
    case 'manifest-tables': {
      // Lista "schema.tabela" do manifesto, uma por linha (para o script contar no banco restaurado).
      const manifest = readJson(`${args[0]}/manifest.json`);
      validateManifest(manifest);
      process.stdout.write(`${Object.keys(manifest.tables).join('\n')}\n`);
      return;
    }
    case 'counts-sql': {
      // SQL de UMA consulta que devolve {"schema.tabela": contagem}. Os nomes vêm do manifesto já validado.
      const manifest = readJson(`${args[0]}/manifest.json`);
      validateManifest(manifest);
      const parts = Object.keys(manifest.tables).map(
        (table) => `'${table}', (select count(*) from ${table})`,
      );
      process.stdout.write(`select json_build_object(${parts.join(', ')});\n`);
      return;
    }
    case 'compare': {
      const [manifestDir, actualFile] = args;
      compareCounts(readJson(`${manifestDir}/manifest.json`).tables, readJson(actualFile));
      return;
    }
    case 'check-size': {
      const [size, previous, accept] = args;
      checkSize({
        size: Number(size),
        previousSize: previous === '-' ? null : Number(previous),
        config,
        acceptSmaller: accept === 'true',
      });
      return;
    }
    case 'check-age': {
      const [kind, lastModified] = args;
      checkAge({ kind, lastModified, config });
      return;
    }
    case 'latest':
    case 'previous': {
      // stdin: JSON [{key,size,lastModified}]. Imprime a chave, o tamanho e a data, ou nada.
      const entries = JSON.parse((await readStdin()) || '[]') ?? [];
      const entry = command === 'latest' ? latestEntry(entries) : previousEntry(entries, args[0]);
      if (entry) process.stdout.write(`${entry.key} ${entry.size} ${entry.lastModified}\n`);
      return;
    }
    case 'parse-choice': {
      process.stdout.write(`${parseBackupChoice(args[0], config)}\n`);
      return;
    }
    case 'ident': {
      // Identificador do erro de um arquivo de saída de ferramenta (ou nada). Nunca o texto em si.
      const ident = extractIdentifier(readFileSync(args[0], 'utf8'), secretValues());
      if (ident) process.stdout.write(`${ident}\n`);
      return;
    }
    case 'pf-items': {
      process.stdout.write(`${SCOPES[requireScope(args[0])].items.join('\n')}\n`);
      return;
    }
    case 'pf-secret-names': {
      process.stdout.write(`${SECRET_NAMES.join('\n')}\n`);
      return;
    }
    case 'pf-format': {
      // Verifica o formato do segredo NOME lendo o valor do ambiente (nunca por argumento).
      appendRecord(formatRecord(args[0], process.env[args[0]], config));
      return;
    }
    case 'pf-record': {
      // pf-record <item> <resultado> <razão>: PULADO e OK escolhidos pelo script, sempre texto fixo.
      appendRecord({ item: args[0], result: args[1], reason: args[2] });
      return;
    }
    case 'pf-classify': {
      const [step, exitCode, file] = args;
      appendRecord(
        classify({
          step,
          exitCode: Number(exitCode),
          text: existsSync(file) ? readFileSync(file, 'utf8') : '',
          secrets: secretValues(),
        }),
      );
      return;
    }
    case 'pf-internal': {
      appendRecord(internalFailure(args[0], Number(args[1])));
      return;
    }
    case 'pf-finish': {
      // Anotações e linhas de log (texto fixo). Sai com 1 se houver QUALQUER item FALHOU.
      const evaluation = evaluateFromFile(requireScope(args[0]));
      const out = [
        ...preflightLogLines(evaluation, textOptions()),
        ...preflightAnnotations(evaluation, textOptions()),
      ];
      process.stdout.write(`${out.join('\n')}\n`);
      if (evaluation.failed) {
        throw new BackupError(
          `Pré-verificação das credenciais: ${evaluation.counts.failed} de ${evaluation.counts.total} verificações falharam. O backup não continua.`,
        );
      }
      return;
    }
    case 'pf-summary': {
      const scope = requireScope(args[0]);
      process.stdout.write(
        existsSync(resultsPath())
          ? renderPreflightSummary(evaluateFromFile(scope), textOptions())
          : renderPreflightMissing(scope),
      );
      return;
    }
    default:
      throw new BackupError(`Comando desconhecido: ${command}`);
  }
}

run().catch((error) => {
  // Só mensagens nossas (BackupError, pt-BR, sem dado) ou o nome do erro: nunca o texto de outro erro.
  const text =
    error instanceof BackupError ? error.message : `Falha inesperada (${error?.name ?? 'Error'}).`;
  process.stderr.write(`${text}\n`);
  process.exit(1);
});
