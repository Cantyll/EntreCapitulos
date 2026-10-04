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

// ---------------------------------------------------------------------------------------------
// Pré-verificação das credenciais (ajuste da etapa 8d)
//
// O repositório e os logs são PÚBLICOS. Regras desta parte (testadas em tests/backup/):
//  - nada daqui devolve valor de segredo, pedaço de segredo, mensagem de ferramenta ou linha de dado;
//  - `classify` recebe o texto de erro de uma ferramenta, mas só devolve códigos de uma tabela fixa. O único
//    trecho que vem do texto é o IDENTIFICADOR do erro (`extractIdentifier`), tirado de posições
//    estruturais conhecidas, aceito só se casar com uma expressão estrita e não parecer um segredo;
//  - todo texto que aparece no resumo e nas anotações sai das tabelas fixas abaixo (REASONS e ITEM_INFO).
// ---------------------------------------------------------------------------------------------

export const RESULTS = ['OK', 'FALHOU', 'PULADO'];

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;
const HTTP_STATUS = /^[1-5][0-9]{2}$/;

const R2_NAMES = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];

/** Formato esperado de cada segredo. `test` só vê o valor já sem espaços nas pontas. */
export const SECRET_SPECS = {
  R2_ACCOUNT_ID: {
    hint: '32 caracteres hexadecimais minúsculos (o Account ID da página do R2)',
    test: (value) => /^[0-9a-f]{32}$/.test(value),
  },
  R2_ACCESS_KEY_ID: {
    hint: '32 caracteres hexadecimais minúsculos (o Access Key ID do token do R2)',
    test: (value) => /^[0-9a-f]{32}$/.test(value),
  },
  R2_SECRET_ACCESS_KEY: {
    hint: '64 caracteres hexadecimais minúsculos (o Secret Access Key do token do R2, que a Cloudflare mostra uma vez só)',
    test: (value) => /^[0-9a-f]{64}$/.test(value),
  },
  R2_BUCKET: {
    hint: '3 a 63 caracteres: letras minúsculas, números e hífens, começando e terminando com letra ou número',
    test: (value) => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value),
  },
  BACKUP_PASSPHRASE: {
    hint: 'uma linha só, com o tamanho mínimo de .github/backup.config.json (preflight.passphraseMinLength)',
    test: (value, config) =>
      !/[\r\n]/.test(value) && [...value].length >= (config?.preflight?.passphraseMinLength ?? 16),
  },
  SUPABASE_ACCESS_TOKEN: {
    hint: 'começa com sbp_ e tem 40 caracteres hexadecimais minúsculos (o mesmo formato que a CLI do Supabase aceita)',
    test: (value) => /^sbp_(oauth_)?[a-f0-9]{40}$/.test(value),
  },
  SUPABASE_DB_PASSWORD: { hint: 'a senha do banco do projeto', test: () => true },
  SUPABASE_PROJECT_REF: {
    hint: 'exatamente 20 letras minúsculas (o código que aparece na URL do projeto)',
    test: (value) => /^[a-z]{20}$/.test(value),
  },
  RESTORE_TARGET_PROJECT_REF: {
    hint: 'exatamente 20 letras minúsculas (o código do projeto novo)',
    test: (value) => /^[a-z]{20}$/.test(value),
  },
  RESTORE_TARGET_DB_PASSWORD: { hint: 'a senha do banco do projeto novo', test: () => true },
};
export const SECRET_NAMES = Object.keys(SECRET_SPECS);

/**
 * Presença e formato de um segredo, SEM devolver o valor nem o tamanho.
 * `absent` cobre variável não definida e texto vazio: o GitHub entrega um segredo que não existe (ou que
 * está em outro Environment) como texto vazio, então os dois casos são indistinguíveis. `empty` é só
 * espaços ou quebras de linha.
 * @returns {'ok'|'absent'|'empty'|'whitespace'|'format'}
 */
export function checkSecretFormat(name, value, config) {
  const spec = SECRET_SPECS[name];
  if (!spec) throw new BackupError('Segredo desconhecido.');
  if (typeof value !== 'string' || value === '') return 'absent';
  if (value.trim() === '') return 'empty';
  if (value !== value.trim()) return 'whitespace';
  return spec.test(value, config) ? 'ok' : 'format';
}

const fmt = (name) => `fmt.${name}`;
const FMT_R2 = R2_NAMES.map(fmt);
const FMT_PASSPHRASE = fmt('BACKUP_PASSPHRASE');
const FMT_TOKEN = fmt('SUPABASE_ACCESS_TOKEN');

const ITEM_INFO = {
  r2_list: {
    label: 'R2: listar o bucket',
    short: 'R2 listagem do bucket',
    ok: 'O bucket respondeu à listagem (chave, assinatura, conta e bucket aceitos).',
  },
  r2_write: {
    label: 'R2: gravar e apagar um objeto de teste',
    short: 'R2 escrita no bucket',
    ok: 'Gravou e apagou o objeto de teste em _preflight/ (o token tem leitura e escrita).',
  },
  sb_token: {
    label: 'Supabase: token de acesso',
    short: 'Supabase token de acesso',
    ok: 'O Supabase aceitou o token.',
  },
  sb_project: {
    label: 'Supabase: código do projeto',
    short: 'Supabase código do projeto',
    ok: 'O projeto existe e o token tem acesso a ele.',
  },
  sb_db: {
    label: 'Supabase: senha e conexão do banco',
    short: 'Supabase senha do banco',
    ok: 'O banco aceitou a conexão e a senha.',
  },
  gpg_cycle: {
    label: 'Frase-senha: criptografar e descriptografar um texto de teste',
    short: 'Frase-senha no gpg',
    ok: 'O gpg criptografou e descriptografou o texto de teste com a frase-senha.',
  },
  prev_daily: {
    label: 'Frase-senha: abrir o backup diário mais recente',
    short: 'Frase-senha e backup diário',
    ok: 'A frase-senha atual abre o backup diário mais recente.',
  },
  prev_weekly: {
    label: 'Frase-senha: abrir o backup semanal mais recente',
    short: 'Frase-senha e backup semanal',
    ok: 'A frase-senha atual abre o backup semanal mais recente.',
  },
  internal: {
    label: 'Pré-verificação (erro inesperado)',
    short: 'Pré-verificação erro inesperado',
    ok: '',
  },
};

// Rótulos do Environment restore: o destino é outro projeto, não o de produção.
const RESTORE_LABELS = {
  sb_token: 'Supabase: token de acesso (cópia no Environment restore)',
  sb_project: 'Supabase: projeto de destino (RESTORE_TARGET_PROJECT_REF)',
  sb_db: 'Supabase: senha e conexão do banco de destino (RESTORE_TARGET_DB_PASSWORD)',
};

/**
 * Itens de cada escopo, na ordem em que aparecem na tabela.
 *  backup         backup.yml (todos os segredos; grava um objeto de teste no R2)
 *  drill          backup-drill.yml (só leitura no R2 e frase-senha; o drill restaura num banco local)
 *  check-backup   credentials-check.yml com o Environment backup (o do backup, mais o backup semanal)
 *  check-restore  credentials-check.yml com o Environment restore (R2 só leitura; nunca grava)
 *  selftest       só o teste do CI contra um S3 local (exige R2_ENDPOINT); sem verificação de formato
 */
export const SCOPES = {
  backup: {
    environment: 'backup',
    title: 'Backup do banco',
    items: [
      ...FMT_R2,
      FMT_PASSPHRASE,
      FMT_TOKEN,
      fmt('SUPABASE_DB_PASSWORD'),
      fmt('SUPABASE_PROJECT_REF'),
      'r2_list',
      'r2_write',
      'sb_token',
      'sb_project',
      'sb_db',
      'gpg_cycle',
      'prev_daily',
    ],
  },
  drill: {
    environment: 'backup',
    title: 'Prova de restauração do backup',
    items: [...FMT_R2, FMT_PASSPHRASE, 'r2_list', 'gpg_cycle', 'prev_weekly'],
  },
  'check-backup': {
    environment: 'backup',
    title: 'Verificação das credenciais (Environment backup)',
    items: [
      ...FMT_R2,
      FMT_PASSPHRASE,
      FMT_TOKEN,
      fmt('SUPABASE_DB_PASSWORD'),
      fmt('SUPABASE_PROJECT_REF'),
      'r2_list',
      'r2_write',
      'sb_token',
      'sb_project',
      'sb_db',
      'gpg_cycle',
      'prev_daily',
      'prev_weekly',
    ],
  },
  'check-restore': {
    environment: 'restore',
    title: 'Verificação das credenciais (Environment restore)',
    items: [
      ...FMT_R2,
      FMT_PASSPHRASE,
      FMT_TOKEN,
      fmt('RESTORE_TARGET_PROJECT_REF'),
      fmt('RESTORE_TARGET_DB_PASSWORD'),
      'r2_list',
      'sb_token',
      'sb_project',
      'sb_db',
      'gpg_cycle',
      'prev_daily',
      'prev_weekly',
    ],
  },
  selftest: {
    environment: 'backup',
    title: 'Autoteste contra um S3 local',
    items: ['r2_list', 'r2_write', 'gpg_cycle', 'prev_daily', 'prev_weekly'],
  },
};

export function isScope(name) {
  return typeof name === 'string' && Object.hasOwn(SCOPES, name);
}

/** Quem cada item espera: um item só vira PULADO por dependência se algum destes tiver FALHADO. */
const DEPENDS_ON = {
  r2_list: FMT_R2,
  r2_write: [...FMT_R2, 'r2_list'],
  sb_token: [FMT_TOKEN],
  sb_project: [
    FMT_TOKEN,
    fmt('SUPABASE_PROJECT_REF'),
    fmt('RESTORE_TARGET_PROJECT_REF'),
    'sb_token',
  ],
  sb_db: [
    fmt('SUPABASE_DB_PASSWORD'),
    fmt('RESTORE_TARGET_DB_PASSWORD'),
    fmt('SUPABASE_PROJECT_REF'),
    fmt('RESTORE_TARGET_PROJECT_REF'),
    'sb_project',
  ],
  gpg_cycle: [FMT_PASSPHRASE],
  prev_daily: [...FMT_R2, FMT_PASSPHRASE, 'r2_list', 'gpg_cycle'],
  prev_weekly: [...FMT_R2, FMT_PASSPHRASE, 'r2_list', 'gpg_cycle'],
};

/** Passos que rodam uma ferramenta. `family` escolhe as regras de classificação. */
const STEPS = {
  setup: { item: 'internal', family: 'none', op: 'none', label: 'preparação da pré-verificação' },
  format: {
    item: 'internal',
    family: 'none',
    op: 'none',
    label: 'verificação de formato dos segredos',
  },
  r2_list: { item: 'r2_list', family: 'r2', op: 'list', label: 'R2: listar o bucket' },
  r2_put: { item: 'r2_write', family: 'r2', op: 'write', label: 'R2: gravar o objeto de teste' },
  r2_delete: {
    item: 'r2_write',
    family: 'r2',
    op: 'delete',
    label: 'R2: apagar o objeto de teste',
  },
  sb_token: { item: 'sb_token', family: 'sb', op: 'token', label: 'Supabase: token de acesso' },
  sb_project: {
    item: 'sb_project',
    family: 'sb',
    op: 'project',
    label: 'Supabase: código do projeto',
  },
  sb_db: { item: 'sb_db', family: 'sb', op: 'db', label: 'Supabase: senha e conexão do banco' },
  gpg_cycle: {
    item: 'gpg_cycle',
    family: 'gpg',
    op: 'cycle',
    label: 'Frase-senha: criptografar e descriptografar um texto de teste',
  },
};
for (const [kind, name] of [
  ['daily', 'diário'],
  ['weekly', 'semanal'],
]) {
  STEPS[`prev_${kind}_list`] = {
    item: `prev_${kind}`,
    family: 'r2',
    op: 'read',
    label: `Backup ${name} anterior: listar no R2`,
  };
  STEPS[`prev_${kind}_get`] = {
    item: `prev_${kind}`,
    family: 'r2',
    op: 'read',
    label: `Backup ${name} anterior: baixar do R2`,
  };
  STEPS[`prev_${kind}_open`] = {
    item: `prev_${kind}`,
    family: 'gpg',
    op: 'open',
    label: `Backup ${name} anterior: abrir com a frase-senha`,
  };
}

export function isStep(name) {
  return typeof name === 'string' && Object.hasOwn(STEPS, name);
}

/**
 * Textos fixos. `{env}`, `{name}`, `{hint}` e `{min}` vêm do catálogo (nunca do texto de uma ferramenta).
 * `result` é o único resultado que a razão admite; `dependency` marca o PULADO que exige uma falha anterior.
 */
const ENV_PATH = "no Environment '{env}' (Settings → Environments → {env})";
const REASONS = {
  ok: { result: 'OK', motivo: '', acao: '—' },
  prev_none: { result: 'OK', motivo: 'Sem backup anterior para comparar.', acao: '—' },

  fmt_absent: {
    result: 'FALHOU',
    motivo: '{name} ausente.',
    acao: `Crie o segredo {name} ${ENV_PATH}, em Environment secrets (não em Repository secrets). Um segredo criado no lugar errado chega vazio.`,
  },
  fmt_empty: {
    result: 'FALHOU',
    motivo: '{name} vazio (só espaços ou quebras de linha).',
    acao: `Edite o segredo {name} ${ENV_PATH} e cole o valor.`,
  },
  fmt_whitespace: {
    result: 'FALHOU',
    motivo: '{name} com espaço ou quebra de linha sobrando.',
    acao: `Edite o segredo {name} ${ENV_PATH} e apague o espaço ou a quebra de linha no começo ou no fim.`,
  },
  fmt_format: {
    result: 'FALHOU',
    motivo: '{name} com formato inesperado.',
    acao: `Cole de novo o valor completo ${ENV_PATH}, sem alterá-lo. Formato esperado: {hint}.`,
  },

  r2_key_invalid: {
    result: 'FALHOU',
    motivo:
      'R2_ACCESS_KEY_ID inválida: a Cloudflare não reconhece essa chave (token apagado, revogado ou expirado). Também pode ser a R2_SECRET_ACCESS_KEY incorreta.',
    acao: `Confira R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY ${ENV_PATH}; se o token foi apagado na Cloudflare, crie outro (Object Read & Write, só neste bucket) e atualize os dois segredos.`,
  },
  r2_signature: {
    result: 'FALHOU',
    motivo:
      'Assinatura não confere: R2_SECRET_ACCESS_KEY incorreta, ou R2_ACCOUNT_ID de outra conta.',
    acao: `Edite R2_SECRET_ACCESS_KEY ${ENV_PATH} e confira também R2_ACCOUNT_ID.`,
  },
  r2_no_bucket: {
    result: 'FALHOU',
    motivo:
      'Bucket inexistente ou de outra conta (R2_BUCKET). Um bucket criado com jurisdição específica (UE ou FedRAMP) usa outro endereço, que este workflow não usa.',
    acao: `Confira o nome em R2_BUCKET ${ENV_PATH} e se o bucket está na mesma conta do R2_ACCOUNT_ID.`,
  },
  r2_bad_bucket_name: {
    result: 'FALHOU',
    motivo: 'R2_BUCKET não é um nome de bucket válido.',
    acao: `Edite R2_BUCKET ${ENV_PATH} com o nome exato do bucket.`,
  },
  r2_not_entitled: {
    result: 'FALHOU',
    motivo: 'A conta da Cloudflare não tem o R2 ativo.',
    acao: 'Ative o R2 na Cloudflare (pode pedir uma forma de pagamento) e rode de novo.',
  },
  r2_list_denied: {
    result: 'FALHOU',
    motivo:
      'O token do R2 não tem acesso a este bucket (restrito a outro bucket ou sem permissão).',
    acao: `Na Cloudflare (R2 → Manage API Tokens) confira que o token vale para este bucket com Object Read & Write; se não, crie outro e atualize R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY ${ENV_PATH}.`,
  },
  r2_write_denied: {
    result: 'FALHOU',
    motivo: 'O token do R2 não tem permissão de escrita (por exemplo, só leitura) neste bucket.',
    acao: `Na Cloudflare crie um token com Object Read & Write só para este bucket e atualize R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY ${ENV_PATH}.`,
  },
  r2_cannot_delete: {
    result: 'FALHOU',
    motivo:
      'O token do R2 grava, mas não consegue apagar o objeto de teste. Um objeto minúsculo pode ter ficado em _preflight/.',
    acao: 'Confira as permissões do token (Object Read & Write inclui apagar) e, se quiser, apague _preflight/ pelo painel da Cloudflare.',
  },
  r2_read_denied: {
    result: 'FALHOU',
    motivo: 'O token do R2 não conseguiu ler os backups que já existem no bucket.',
    acao: `Confira que o token tem Object Read neste bucket e atualize R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY ${ENV_PATH}.`,
  },
  r2_unreachable: {
    result: 'FALHOU',
    motivo:
      'Endpoint do R2 inalcançável: R2_ACCOUNT_ID de uma conta que não existe (o endereço é https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com), ou falha de rede ou da Cloudflare.',
    acao: `Confira R2_ACCOUNT_ID ${ENV_PATH}; se estiver certo, rode de novo mais tarde e veja cloudflarestatus.com.`,
  },
  r2_service: {
    result: 'FALHOU',
    motivo: 'O R2 respondeu com erro de serviço ou limite de requisições (do lado da Cloudflare).',
    acao: 'Rode de novo em alguns minutos; se persistir, veja cloudflarestatus.com.',
  },

  sb_token_invalid: {
    result: 'FALHOU',
    motivo: 'SUPABASE_ACCESS_TOKEN inválido, expirado ou revogado.',
    acao: `Crie um token novo no painel do Supabase (Account → Access Tokens) e atualize SUPABASE_ACCESS_TOKEN ${ENV_PATH} (e onde mais ele existir, como o Database deploy).`,
  },
  sb_project_unknown: {
    result: 'FALHOU',
    motivo: 'Código do projeto inexistente, ou o token não tem acesso a esse projeto.',
    acao: `Confira o código do projeto ${ENV_PATH} (20 letras, na URL do painel) e se o token é de uma conta com acesso a ele.`,
  },
  sb_project_format: {
    result: 'FALHOU',
    motivo: 'Código do projeto com formato inesperado (a CLI exige 20 letras minúsculas).',
    acao: `Edite o código do projeto ${ENV_PATH} com o valor exato da URL do painel do Supabase.`,
  },
  sb_db_password: {
    result: 'FALHOU',
    motivo:
      'Senha do banco recusada: a senha do segredo está incorreta ou foi trocada no Supabase.',
    acao: `Edite a senha do banco ${ENV_PATH}. Se não a souber, redefina-a no painel do Supabase (configurações do banco) e atualize também o segredo do Database deploy.`,
  },
  sb_db_blocked: {
    result: 'FALHOU',
    motivo: 'O banco bloqueou novas conexões por excesso de tentativas com senha errada.',
    acao: `Espere alguns minutos, confira a senha do banco ${ENV_PATH} e rode de novo.`,
  },
  sb_network: {
    result: 'FALHOU',
    motivo:
      'Falha de conexão ou de rede com o Supabase: serviço fora do ar, rede do runner ou projeto pausado (plano gratuito).',
    acao: 'Veja se o projeto está ativo no painel do Supabase (se estiver pausado, restaure-o: docs/operacao.md, seção 10) e rode de novo.',
  },

  gpg_failed: {
    result: 'FALHOU',
    motivo:
      'O gpg não conseguiu criptografar e descriptografar o texto de teste com a frase-senha.',
    acao: `Edite BACKUP_PASSPHRASE ${ENV_PATH} (uma linha só, sem espaços sobrando). Se persistir, o gpg do runner pode estar com problema: rode de novo.`,
  },
  prev_wrong: {
    result: 'FALHOU',
    motivo:
      'A frase-senha atual NÃO abre os backups anteriores (sinal de que foi trocada ou digitada diferente; menos provável: arquivo corrompido).',
    acao: `Corrija BACKUP_PASSPHRASE ${ENV_PATH} com a frase que criptografou os backups anteriores. Se você a trocou de propósito, rode o backup manual com passphrase_rotated e force_weekly ligadas.`,
  },

  skipped_rotated: {
    result: 'PULADO',
    motivo: 'Verificação pulada de propósito (passphrase_rotated ligada).',
    acao: 'Rode uma vez o backup manual com force_weekly para o backup diário mais recente passar a abrir com a frase nova; depois deixe passphrase_rotated desligada.',
  },
  skipped_dependency: {
    result: 'PULADO',
    dependency: true,
    motivo: 'Não verificado porque um item anterior falhou.',
    acao: 'Corrija os itens com FALHOU acima e rode de novo.',
  },
  target_not_created: {
    result: 'PULADO',
    motivo:
      'Os segredos do projeto de destino (RESTORE_TARGET_*) ainda não existem neste Environment (normal fora do dia da restauração).',
    acao: 'Nada a fazer agora. Crie-os só no dia de restaurar (docs/operacao.md, seção 15).',
  },

  not_run: {
    result: 'FALHOU',
    motivo: 'Esta verificação não chegou a rodar: a pré-verificação foi interrompida.',
    acao: 'Rode de novo; se repetir, veja o passo da pré-verificação no log.',
  },
  inconsistent: {
    result: 'FALHOU',
    motivo:
      'Resultado inconsistente na pré-verificação (um item pulado sem causa ou registro inválido).',
    acao: 'Rode de novo; se repetir, peça ajuda numa sessão de desenvolvimento.',
  },
  unclassified: {
    result: 'FALHOU',
    motivo: '',
    acao: "Veja a seção 'Diagnóstico de falhas do backup' em docs/operacao.md. Se o identificador do erro for novo, informe-o numa sessão de desenvolvimento.",
  },
};

export const REASON_IDS = Object.keys(REASONS);

// --- Identificador do erro --------------------------------------------------------------------

// `An error occurred (Codigo) when calling the Operation operation` (aws CLI v1 e v2, com ou sem prefixo).
const AWS_ERROR =
  /^(?:aws: \[ERROR\]: )?An error occurred \(([^)\n]{1,64})\) when calling the \w+ operation/m;

/** Erros da CLI do Supabase em JSON: uma linha `{"_tag":"Error","error":{"code":"…","message":"…"}}`. */
function supabaseErrors(text) {
  const errors = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (parsed?._tag === 'Error' && parsed.error && typeof parsed.error === 'object') {
      errors.push(parsed.error);
    }
  }
  return errors;
}

/** Aceita só `^[A-Za-z][A-Za-z0-9_.]{0,63}$` ou um status HTTP de 3 dígitos, e nada que lembre um segredo. */
export function isSafeIdentifier(value, secrets = []) {
  if (typeof value !== 'string') return false;
  if (!IDENTIFIER.test(value) && !HTTP_STATUS.test(value)) return false;
  if (/^[0-9a-f]{16,}$/i.test(value) || /sbp_/i.test(value)) return false;
  const lower = value.toLowerCase();
  return !secrets.some((secret) => {
    if (typeof secret !== 'string' || secret.length < 4) return false;
    const other = secret.toLowerCase();
    return lower.includes(other) || (lower.length >= 8 && other.includes(lower));
  });
}

/**
 * O identificador do erro, ou null. Só olha posições estruturais: o código entre parênteses do aws, o campo
 * `code` (e `status`/`statusCode`) do JSON de erro da CLI do Supabase. Nunca devolve a mensagem nem o resto
 * da linha.
 */
export function extractIdentifier(text, secrets = []) {
  const source = typeof text === 'string' ? text : '';
  const candidates = [];
  const aws = AWS_ERROR.exec(source);
  if (aws) candidates.push(aws[1]);
  for (const error of supabaseErrors(source)) {
    if (typeof error.code === 'string') candidates.push(error.code);
    for (const key of ['status', 'statusCode']) {
      if (Number.isInteger(error[key])) candidates.push(String(error[key]));
    }
  }
  return candidates.find((candidate) => isSafeIdentifier(candidate, secrets)) ?? null;
}

// --- Classificação ----------------------------------------------------------------------------

const R2_NETWORK =
  /Could not connect to the endpoint URL|SSL validation failed|Connect timeout on endpoint URL|Read timeout on endpoint URL|Could not resolve host|Name or service not known|EndpointConnectionError|ConnectTimeoutError|Temporary failure in name resolution/i;
const NETWORK =
  /dial tcp|dial error|no such host|hostname resolving error|i\/o timeout|connection refused|connection reset|TLS handshake timeout|context deadline exceeded|network is unreachable|Client\.Timeout|server misbehaving|temporary failure in name resolution|time(?:d)?[ -]?out/i;
const SERVER_ERROR =
  /\b(?:500|502|503|504|429)\b|Bad Gateway|Service Unavailable|Gateway Time-?out|Too Many Requests/i;
const PASSWORD_REFUSED =
  /password authentication failed|failed SASL auth|SQLSTATE 28P01|\b28P01\b/i;
const CIRCUIT_BREAKER = /circuit breaker open|too many authentication errors/i;
const TOKEN_REFUSED = /Unauthorized|Forbidden|\b40[13]\b|Invalid JWT|expired|revoked/i;
const PROJECT_REFUSED = /Unauthorized|Forbidden|not found|privileges|\b40[134]\b/i;

function r2Reason(op, text) {
  switch (AWS_ERROR.exec(text)?.[1]) {
    case 'InvalidAccessKeyId':
    case 'Unauthorized':
    case '401':
      return 'r2_key_invalid';
    case 'SignatureDoesNotMatch':
      return 'r2_signature';
    case 'NoSuchBucket':
      return 'r2_no_bucket';
    case 'InvalidBucketName':
      return 'r2_bad_bucket_name';
    case 'NotEntitled':
      return 'r2_not_entitled';
    case 'AccessDenied':
    case '403':
      if (op === 'write') return 'r2_write_denied';
      if (op === 'delete') return 'r2_cannot_delete';
      return op === 'read' ? 'r2_read_denied' : 'r2_list_denied';
    case 'InternalError':
    case 'ServiceUnavailable':
    case 'TooManyRequests':
    case '500':
    case '503':
    case '429':
      return 'r2_service';
    default:
      return R2_NETWORK.test(text) ? 'r2_unreachable' : null;
  }
}

function supabaseReason(op, text) {
  const codes = supabaseErrors(text).map((error) => error.code);
  const tokenInvalid =
    codes.includes('InvalidAccessTokenError') || /Invalid access token format/.test(text);
  if (op === 'token') {
    if (tokenInvalid) return 'sb_token_invalid';
    if (NETWORK.test(text) || SERVER_ERROR.test(text)) return 'sb_network';
    return TOKEN_REFUSED.test(text) ? 'sb_token_invalid' : null;
  }
  if (PASSWORD_REFUSED.test(text)) return 'sb_db_password';
  if (CIRCUIT_BREAKER.test(text)) return 'sb_db_blocked';
  if (op === 'project') {
    if (codes.includes('LinkBranchNotLinkedError') || /not a project ref/i.test(text)) {
      return 'sb_project_format';
    }
    if (tokenInvalid) return 'sb_token_invalid';
    if (NETWORK.test(text) || SERVER_ERROR.test(text)) return 'sb_network';
    return codes.includes('LinkProjectStatusError') && PROJECT_REFUSED.test(text)
      ? 'sb_project_unknown'
      : null;
  }
  if (/Tenant or user not found/i.test(text)) return 'sb_project_unknown';
  return NETWORK.test(text) ? 'sb_network' : null;
}

/**
 * Classifica a falha de um passo. Entrada: o passo, o código de saída e o texto (stdout+stderr) da
 * ferramenta. Saída: um registro com item, resultado e uma razão da tabela fixa. O texto de entrada NUNCA
 * volta, salvo o identificador (ver `extractIdentifier`), e só quando a razão não é conhecida.
 * @param {{step: string, exitCode: number, text?: string, secrets?: string[]}} input
 * @returns {{item: string, result: string, reason: string, step?: string, code?: number, ident?: string}}
 */
export function classify({ step, exitCode, text = '', secrets = [] }) {
  const info = STEPS[step];
  if (!info) throw new BackupError('Passo desconhecido.');
  if (exitCode === 0) return { item: info.item, result: 'OK', reason: 'ok' };
  const source = typeof text === 'string' ? text : '';
  let reason = null;
  if (info.family === 'gpg') reason = info.op === 'open' ? 'prev_wrong' : 'gpg_failed';
  else if (info.family === 'r2') reason = r2Reason(info.op, source);
  else if (info.family === 'sb') reason = supabaseReason(info.op, source);
  if (reason) return { item: info.item, result: 'FALHOU', reason };
  const code = Number.isInteger(exitCode) && exitCode > 0 && exitCode <= 255 ? exitCode : 1;
  const record = { item: info.item, result: 'FALHOU', reason: 'unclassified', step, code };
  const ident = extractIdentifier(source, secrets);
  if (ident) record.ident = ident;
  return record;
}

/** Registro de uma falha da própria pré-verificação (erro inesperado de um passo). */
export function internalFailure(step, exitCode) {
  const known = isStep(step) ? step : 'setup';
  const code = Number.isInteger(exitCode) && exitCode > 0 && exitCode <= 255 ? exitCode : 1;
  return { item: 'internal', result: 'FALHOU', reason: 'unclassified', step: known, code };
}

/** Registro de uma verificação de formato (`fmt.NOME`). */
export function formatRecord(name, value, config) {
  const status = checkSecretFormat(name, value, config);
  const reason = {
    ok: 'ok',
    absent: 'fmt_absent',
    empty: 'fmt_empty',
    whitespace: 'fmt_whitespace',
    format: 'fmt_format',
  }[status];
  return { item: fmt(name), result: status === 'ok' ? 'OK' : 'FALHOU', reason };
}

// --- Validação, avaliação e texto -------------------------------------------------------------

function knownItem(item) {
  return (
    typeof item === 'string' &&
    (item.startsWith('fmt.')
      ? Object.hasOwn(SECRET_SPECS, item.slice(4))
      : Object.hasOwn(ITEM_INFO, item))
  );
}

/** Aceita só registros com item, resultado e razão conhecidos e coerentes entre si. Devolve null se não. */
export function sanitizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { item, result, reason } = raw;
  if (!knownItem(item) || !RESULTS.includes(result) || !Object.hasOwn(REASONS, reason)) return null;
  if (REASONS[reason].result !== result) return null;
  if (item === 'internal' && reason !== 'unclassified' && reason !== 'inconsistent') return null;
  const record = { item, result, reason };
  if (reason === 'unclassified') {
    if (!isStep(raw.step) || !Number.isInteger(raw.code) || raw.code < 1 || raw.code > 255)
      return null;
    record.step = raw.step;
    record.code = raw.code;
    if (raw.ident !== undefined) {
      if (!isSafeIdentifier(raw.ident)) return null;
      record.ident = raw.ident;
    }
  }
  return record;
}

/** Lê o arquivo de resultados (um JSON por linha). Linhas inválidas viram `invalid` (nunca são mostradas). */
export function parseRecords(text) {
  const records = [];
  let invalid = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = null;
    }
    const record = sanitizeRecord(parsed);
    if (record) records.push(record);
    else invalid += 1;
  }
  return { records, invalid };
}

/**
 * Junta os registros de um escopo na lista final, na ordem da tabela, e decide o resultado do job.
 * Regras: item sem registro vira FALHOU (`not_run`); PULADO por dependência exige que algum item de que ele
 * depende tenha FALHOU, senão vira FALHOU (`inconsistent`); o job falha se houver QUALQUER FALHOU. Um PULADO
 * nunca esconde um FALHOU.
 */
export function evaluatePreflight(records, scopeName, { invalid = 0 } = {}) {
  const scope = SCOPES[scopeName];
  if (!scope) throw new BackupError('Escopo desconhecido.');
  const byItem = new Map();
  const internal = [];
  for (const record of records) {
    if (record.item === 'internal') internal.push(record);
    else if (scope.items.includes(record.item)) byItem.set(record.item, record);
  }
  const first = scope.items.map(
    (item) => byItem.get(item) ?? { item, result: 'FALHOU', reason: 'not_run' },
  );
  // Um PULADO por dependência só vale se a cadeia de que ele depende termina numa falha de verdade (a
  // dependência pode ser outro PULADO: token que falhou -> projeto pulado -> senha pulada).
  const blocked = new Set(first.filter((r) => r.result === 'FALHOU').map((r) => r.item));
  const waiting = first.filter((r) => r.result === 'PULADO' && REASONS[r.reason].dependency);
  for (let changed = true; changed;) {
    changed = false;
    for (const record of waiting) {
      const deps = DEPENDS_ON[record.item] ?? [];
      if (!blocked.has(record.item) && deps.some((dep) => blocked.has(dep))) {
        blocked.add(record.item);
        changed = true;
      }
    }
  }
  const final = first.map((record) =>
    record.result === 'PULADO' && REASONS[record.reason].dependency && !blocked.has(record.item)
      ? { item: record.item, result: 'FALHOU', reason: 'inconsistent' }
      : record,
  );
  final.push(...internal);
  if (invalid > 0) final.push({ item: 'internal', result: 'FALHOU', reason: 'inconsistent' });
  const failed = final.filter((record) => record.result === 'FALHOU').length;
  return {
    scope: scopeName,
    records: final,
    failed: failed > 0,
    counts: {
      total: final.length,
      failed,
      skipped: final.filter((record) => record.result === 'PULADO').length,
    },
  };
}

function itemLabel(item, scopeName) {
  if (item.startsWith('fmt.')) return `${item.slice(4)} (formato)`;
  if (scopeName === 'check-restore' && RESTORE_LABELS[item]) return RESTORE_LABELS[item];
  return ITEM_INFO[item].label;
}

function itemShort(item) {
  return item.startsWith('fmt.') ? `${item.slice(4)} formato` : ITEM_INFO[item].short;
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

/** Os textos fixos de um registro: item, resultado, motivo e o que fazer. */
export function describeRecord(record, scopeName, { passphraseMinLength = 16 } = {}) {
  const scope = SCOPES[scopeName];
  if (!scope) throw new BackupError('Escopo desconhecido.');
  const name = record.item.startsWith('fmt.') ? record.item.slice(4) : '';
  const vars = {
    env: scope.environment,
    name,
    hint: fill(SECRET_SPECS[name]?.hint ?? '', { min: passphraseMinLength }),
  };
  const reason = REASONS[record.reason];
  let motivo = fill(reason.motivo, vars);
  if (record.reason === 'ok') {
    motivo = name ? 'Formato válido.' : ITEM_INFO[record.item].ok;
  } else if (record.reason === 'unclassified') {
    motivo = `Erro não classificado no passo ${STEPS[record.step].label} (código de saída ${record.code})`;
    motivo += record.ident ? `. Identificador do erro: ${record.ident}` : '';
    motivo += '.';
  }
  return {
    item: record.item,
    label: itemLabel(record.item, scopeName),
    short: itemShort(record.item),
    result: record.result,
    motivo,
    acao: fill(reason.acao, vars),
  };
}

const ICONS = { OK: '✅ OK', FALHOU: '❌ FALHOU', PULADO: '⏭️ PULADO' };

const ROTATED_NOTICE =
  '**Atenção: a verificação da frase-senha contra os backups anteriores foi pulada de propósito** (`passphrase_rotated` ligada). Rode **uma vez** o backup manual com **force_weekly** para o backup diário mais recente passar a abrir com a frase nova, e depois deixe `passphrase_rotated` desligada.';

export function rotatedSkip(evaluation) {
  return evaluation.records.some((record) => record.reason === 'skipped_rotated');
}

/** Tabela do resumo do job (Markdown): só texto fixo, sem `|` nem quebra de linha dentro das células. */
export function renderPreflightSummary(evaluation, options) {
  const scope = SCOPES[evaluation.scope];
  const { total, failed, skipped } = evaluation.counts;
  const lines = [`### Pré-verificação das credenciais: ${scope.title}`, ''];
  if (failed > 0) {
    lines.push(
      `**Resultado: FALHOU** (${failed} de ${total} verificações). O backup não continua.`,
    );
  } else {
    lines.push(
      `**Resultado: OK** (${total} verificações${skipped > 0 ? `, ${skipped} puladas` : ''}).`,
    );
  }
  if (rotatedSkip(evaluation)) lines.push('', `> ${ROTATED_NOTICE}`);
  lines.push('', '| Item | Resultado | Motivo | O que fazer |', '| --- | --- | --- | --- |');
  for (const record of evaluation.records) {
    const row = describeRecord(record, evaluation.scope, options);
    lines.push(`| ${row.label} | ${ICONS[row.result]} | ${row.motivo} | ${row.acao} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** Resumo quando o arquivo de resultados não existe (a pré-verificação não terminou). */
export function renderPreflightMissing(scopeName) {
  const scope = SCOPES[scopeName];
  const title = scope ? scope.title : 'credenciais';
  return `### Pré-verificação das credenciais: ${title}\n\n**Resultado: FALHOU.** A pré-verificação não chegou a terminar (um passo anterior falhou, o job foi cancelado ou o tempo esgotou). Veja o log do passo "Pré-verificação das credenciais".\n`;
}

const MAX_ANNOTATIONS = 10;
const clean = (text) => text.replace(/[\r\n%]+/g, ' ').trim();
const cleanTitle = (text) => clean(text).replace(/[,:=]/g, ' ');

/** Anotações do GitHub (`::error title=…::…`), texto fixo por item. No máximo 10 erros por passo. */
export function preflightAnnotations(evaluation, options) {
  const failures = evaluation.records.filter((record) => record.result === 'FALHOU');
  const shown =
    failures.length > MAX_ANNOTATIONS ? failures.slice(0, MAX_ANNOTATIONS - 1) : failures;
  const lines = shown.map((record) => {
    const row = describeRecord(record, evaluation.scope, options);
    return `::error title=${cleanTitle(row.short)}::${clean(`${row.motivo} ${row.acao}`)}`;
  });
  if (failures.length > shown.length) {
    lines.push(
      '::error title=Mais falhas::Há mais verificações com falha: veja a tabela no resumo do job.',
    );
  }
  if (rotatedSkip(evaluation)) {
    lines.push(
      `::warning title=Frase-senha pulada de propósito::${clean(ROTATED_NOTICE.replace(/\*\*|`/g, ''))}`,
    );
  }
  return lines;
}

/** Linhas de texto para o log do passo (uma por item, tudo texto fixo). */
export function preflightLogLines(evaluation, options) {
  return evaluation.records.map((record) => {
    const row = describeRecord(record, evaluation.scope, options);
    return `[${row.result}] ${row.label}: ${row.motivo}`;
  });
}
