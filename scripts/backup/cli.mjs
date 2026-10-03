// Ponto de entrada dos scripts .sh: chama a lógica pura de lib.mjs. Nunca imprime linha de dado.
// Todo erro sai como mensagem fixa em pt-BR (BackupError) ou só com o nome do erro.
import { createReadStream, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';

import {
  BackupError,
  buildManifest,
  checkAge,
  checkSize,
  checkTables,
  compareCounts,
  countCopyRows,
  latestEntry,
  parseBackupChoice,
  previousEntry,
  scrubLog,
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
    case 'scrub': {
      const secrets = args.map((name) => process.env[name] ?? '');
      process.stdout.write(scrubLog(await readStdin(), secrets));
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
