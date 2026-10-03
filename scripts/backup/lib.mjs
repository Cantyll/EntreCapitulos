// Lógica PURA do backup (etapa 8d): contagens, manifesto, checagens e mensagens. Sem rede, sem
// banco e sem ler segredos, para ser testada à parte (tests/backup/). Os scripts .sh só orquestram.
//
// Regra de privacidade: nada aqui devolve ou imprime uma linha de dado. As funções trabalham com
// nomes de tabelas, contagens, tamanhos e datas. Os erros nunca citam o conteúdo de uma linha.
import { createHash } from 'node:crypto';

export class BackupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackupError';
  }
}

const TABLE_NAME = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;
const COPY_HEADER = /^COPY "([^"]+)"\."([^"]+)"[ (]/;
const SHA256 = /^[0-9a-f]{64}$/;

export function isTableName(value) {
  return typeof value === 'string' && TABLE_NAME.test(value);
}

/**
 * Conta as linhas de cada bloco `COPY schema.tabela ... FROM stdin;` de um dump em texto.
 * No formato COPY cada registro ocupa exatamente uma linha (quebras dentro de um valor saem
 * escapadas como \n), então o número de linhas até `\.` é o número de registros.
 * @param {Iterable<string>} lines
 * @returns {Record<string, number>}
 */
export function countCopyRows(lines) {
  const counts = {};
  let current = null;
  for (const line of lines) {
    if (current === null) {
      const match = COPY_HEADER.exec(line);
      if (match) {
        current = `${match[1]}.${match[2]}`;
        counts[current] = 0;
      }
    } else if (line === '\\.') {
      current = null;
    } else {
      counts[current] += 1;
    }
  }
  return counts;
}

/** Confere as tabelas do dump contra a configuração. Falha com mensagem clara. */
export function checkTables(counts, config) {
  const present = Object.keys(counts);
  for (const required of config.dump.requiredTables) {
    if (!present.includes(required)) {
      throw new BackupError(
        `O dump não trouxe a tabela ${required}. Sem ela os perfis e os comentários não podem ser restaurados. Confira se o schema auth está nos schemas do dump (.github/backup.config.json).`,
      );
    }
  }
  const unexpected = present.filter((table) => !config.dump.allowedTables.includes(table));
  if (unexpected.length > 0) {
    throw new BackupError(
      `O dump trouxe tabelas que não estão na lista permitida: ${unexpected.join(', ')}. Se forem tabelas novas e inofensivas, acrescente-as a "allowedTables"; se guardarem sessões ou tokens, acrescente-as a "excludeTables" (.github/backup.config.json).`,
    );
  }
  const absent = config.dump.allowedTables.filter((table) => !present.includes(table));
  return { absent };
}

/**
 * Manifesto: só metadados. Nada de valor de linha, e-mail ou nome.
 * @returns {{formatVersion:number, createdAt:string, cliVersion:string, repoLatestMigration:string, tables:Record<string,number>, files:Record<string,string>}}
 */
export function buildManifest({
  createdAt,
  cliVersion,
  repoLatestMigration,
  counts,
  files,
  formatVersion = 1,
}) {
  const manifest = {
    formatVersion,
    createdAt,
    cliVersion,
    repoLatestMigration,
    tables: counts,
    files,
  };
  validateManifest(manifest);
  return manifest;
}

export function validateManifest(manifest) {
  const keys = [
    'formatVersion',
    'createdAt',
    'cliVersion',
    'repoLatestMigration',
    'tables',
    'files',
  ];
  if (typeof manifest !== 'object' || manifest === null)
    throw new BackupError('Manifesto inválido.');
  const extra = Object.keys(manifest).filter((key) => !keys.includes(key));
  if (extra.length > 0)
    throw new BackupError(`Manifesto com campo inesperado: ${extra.join(', ')}.`);
  if (manifest.formatVersion !== 1) throw new BackupError('Versão de manifesto desconhecida.');
  if (typeof manifest.createdAt !== 'string' || Number.isNaN(Date.parse(manifest.createdAt))) {
    throw new BackupError('Manifesto sem data válida.');
  }
  if (
    typeof manifest.cliVersion !== 'string' ||
    !/^[0-9A-Za-z.+-]{1,40}$/.test(manifest.cliVersion)
  ) {
    throw new BackupError('Manifesto com versão da CLI inválida.');
  }
  if (!/^[0-9]{0,20}(_[a-z0-9_]+)?(\.sql)?$/.test(manifest.repoLatestMigration)) {
    throw new BackupError('Manifesto com migration inválida.');
  }
  for (const [table, count] of Object.entries(manifest.tables ?? {})) {
    if (!isTableName(table) || !Number.isInteger(count) || count < 0) {
      throw new BackupError('Manifesto com contagem inválida.');
    }
  }
  for (const [name, hash] of Object.entries(manifest.files ?? {})) {
    if (!/^[a-z_]+\.sql$/.test(name) || !SHA256.test(hash)) {
      throw new BackupError('Manifesto com arquivo ou hash inválido.');
    }
  }
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Compara as contagens do manifesto com as do banco restaurado. Só nomes de tabela na mensagem. */
export function compareCounts(expected, actual) {
  const wrong = [];
  for (const [table, count] of Object.entries(expected)) {
    if (actual[table] !== count) wrong.push(table);
  }
  if (wrong.length > 0) {
    throw new BackupError(
      `As contagens não batem com o manifesto nas tabelas: ${wrong.join(', ')}. A restauração não pode ser considerada válida.`,
    );
  }
}

/**
 * Tamanho do arquivo criptografado. Falha se vier vazio/minúsculo ou muito menor que o anterior.
 * `previousSize` nulo = primeiro backup (sem comparação).
 */
export function checkSize({ size, previousSize, config, acceptSmaller = false }) {
  if (!Number.isInteger(size) || size <= 0) {
    throw new BackupError('O backup está vazio. Nada foi enviado ao R2.');
  }
  if (size < config.size.minBytes) {
    throw new BackupError(
      `O backup tem só ${size} bytes, menos que o mínimo plausível (${config.size.minBytes}). Nada foi enviado ao R2.`,
    );
  }
  if (previousSize !== null && previousSize !== undefined && !acceptSmaller) {
    const floor = previousSize * config.size.minRatioOfPrevious;
    if (size < floor) {
      throw new BackupError(
        `O backup (${size} bytes) é menos da metade do anterior (${previousSize} bytes). Pode haver dados faltando. Se foi uma exclusão legítima, rode de novo marcando "accept_smaller".`,
      );
    }
  }
}

export function ageHours(lastModified, now = new Date()) {
  const time = Date.parse(lastModified);
  if (Number.isNaN(time)) throw new BackupError('Data do objeto inválida.');
  return (now.getTime() - time) / 3_600_000;
}

/** kind: 'daily' (o mais recente deve ter até 36 h) ou 'weekly' (o restaurado pode ter até 8 dias). */
export function checkAge({ kind, lastModified, config, now = new Date() }) {
  const limit = config.maxAgeHours[kind];
  const age = ageHours(lastModified, now);
  if (age > limit) {
    const hours = Math.floor(age);
    if (kind === 'daily') {
      throw new BackupError(
        `O backup diário mais recente tem ${hours} h (limite: ${limit} h). O backup diário parou de rodar: confira o workflow Backup do banco e as notificações.`,
      );
    }
    throw new BackupError(
      `O backup semanal mais recente tem ${hours} h (limite: ${limit} h, 8 dias). Falta o backup de domingo: confira o workflow Backup do banco.`,
    );
  }
}

/** Entradas de listagem: [{key, size, lastModified}]. Devolve a mais recente por nome (data na chave). */
export function latestEntry(entries) {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => (a.key < b.key ? 1 : -1))[0];
}

/** O backup anterior ao de hoje (para comparar tamanhos), ignorando a chave de hoje. */
export function previousEntry(entries, todayKey) {
  return latestEntry(entries.filter((entry) => entry.key < todayKey));
}

export function dailyKey(config, date) {
  return `${config.prefixes.daily}${date}.tar.gpg`;
}

export function weeklyKey(config, date) {
  return `${config.prefixes.weekly}${date}.tar.gpg`;
}

/** Aceita só `daily/AAAA-MM-DD` ou `weekly/AAAA-MM-DD` (entrada do db-restore). */
export function parseBackupChoice(value, config) {
  const match = /^(daily|weekly)\/(\d{4}-\d{2}-\d{2})$/.exec(value ?? '');
  if (!match || Number.isNaN(Date.parse(match[2]))) {
    throw new BackupError(
      'Informe o backup como daily/AAAA-MM-DD ou weekly/AAAA-MM-DD (por exemplo daily/2026-10-03).',
    );
  }
  return `${config.prefixes[match[1]]}${match[2]}.tar.gpg`;
}

/**
 * Tira de um texto de log as linhas que poderiam carregar dado: linhas de COPY/INSERT, linhas com
 * tabulação (registro do COPY) e qualquer linha que contenha um valor secreto.
 */
export function scrubLog(text, secretValues = []) {
  const secrets = secretValues.filter((value) => typeof value === 'string' && value.length >= 4);
  return text
    .split('\n')
    .filter((line) => {
      if (/^(COPY|INSERT|\\\.)/.test(line) || line.includes('\t')) return false;
      return !secrets.some((secret) => line.includes(secret));
    })
    .join('\n');
}
