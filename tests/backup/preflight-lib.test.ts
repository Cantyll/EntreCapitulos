import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  REASON_IDS,
  SCOPES,
  SECRET_NAMES,
  checkSecretFormat,
  classify,
  describeRecord,
  evaluatePreflight,
  extractIdentifier,
  formatRecord,
  internalFailure,
  isSafeIdentifier,
  parseRecords,
  preflightAnnotations,
  preflightLogLines,
  renderPreflightSummary,
  sanitizeRecord,
  type BackupConfig,
  type PreflightRecord,
} from '../../scripts/backup/lib.mjs';

const config = JSON.parse(readFileSync('.github/backup.config.json', 'utf8')) as BackupConfig;

/*
 * Dados SINTÉTICOS com a cara dos reais (mesmo tamanho e alfabeto), para provar que nada disso vaza.
 * Amostras de erro: as marcadas "real" foram capturadas do `aws` (via moto) e da CLI 2.118 do Supabase
 * (token e link, com um token inventado); as marcadas "representativa" seguem o formato conhecido da
 * ferramenta, mas NÃO foram capturadas do R2 nem do Supabase de verdade (ver o PR).
 */
const SECRETS: Record<string, string> = {
  R2_ACCOUNT_ID: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  R2_ACCESS_KEY_ID: 'f0e1d2c3b4a5968778695a4b3c2d1e0f',
  R2_SECRET_ACCESS_KEY: '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0',
  R2_BUCKET: 'entre-capitulos-backup',
  BACKUP_PASSPHRASE: 'frase-secreta-de-teste-0987654321',
  SUPABASE_ACCESS_TOKEN: `sbp_${'0123456789abcdef'.repeat(2)}01234567`,
  SUPABASE_DB_PASSWORD: 'senha-do-banco-de-teste!42',
  SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
};
const SECRET_VALUES = Object.values(SECRETS);
const EMAIL = 'fulana-de-teste@exemplo.test';
const DATA_LINES = `COPY "auth"."users" (id, email) FROM stdin;\nid-1\t${EMAIL}\n\\.`;

/** Ruído que uma ferramenta pode imprimir: segredos, e-mail e linhas de dado misturados ao erro. */
const noisy = (text: string) =>
  [
    ...SECRET_VALUES.map((value) => `eco: ${value}`),
    text,
    DATA_LINES,
    `mensagem livre com ${EMAIL} e (OutroCodigo) e code=Falso`,
  ].join('\n');

const AWS = (code: string, op: string, message = 'Mensagem da ferramenta.') =>
  `\nAn error occurred (${code}) when calling the ${op} operation: ${message}\n`;
const SB = (code: string, message: string) =>
  `${JSON.stringify({ _tag: 'Error', error: { code, message } })}\n`;

describe('checkSecretFormat', () => {
  it('ausente: variável não definida ou texto vazio (o GitHub entrega segredo inexistente como vazio)', () => {
    for (const name of SECRET_NAMES) {
      expect(checkSecretFormat(name, undefined, config)).toBe('absent');
      expect(checkSecretFormat(name, '', config)).toBe('absent');
    }
  });

  it('vazio: só espaços ou quebras de linha', () => {
    for (const name of SECRET_NAMES) {
      expect(checkSecretFormat(name, '   ', config)).toBe('empty');
      expect(checkSecretFormat(name, '\n', config)).toBe('empty');
      expect(checkSecretFormat(name, ' \t\r\n', config)).toBe('empty');
    }
  });

  it('espaço ou quebra de linha sobrando no começo ou no fim', () => {
    for (const [name, value] of Object.entries(SECRETS)) {
      expect(checkSecretFormat(name, `${value}\n`, config)).toBe('whitespace');
      expect(checkSecretFormat(name, ` ${value}`, config)).toBe('whitespace');
      expect(checkSecretFormat(name, `${value}\r\n`, config)).toBe('whitespace');
    }
  });

  it('valores no formato certo passam', () => {
    for (const [name, value] of Object.entries(SECRETS)) {
      expect(checkSecretFormat(name, value, config), name).toBe('ok');
    }
    expect(checkSecretFormat('RESTORE_TARGET_PROJECT_REF', 'tsrqponmlkjihgfedcba', config)).toBe(
      'ok',
    );
    expect(checkSecretFormat('RESTORE_TARGET_DB_PASSWORD', 'qualquer coisa 1', config)).toBe('ok');
  });

  it('formato inesperado: ID da conta e chaves do R2 (hexadecimal minúsculo, 32 e 64)', () => {
    const hex32 = SECRETS.R2_ACCOUNT_ID!;
    for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID']) {
      expect(checkSecretFormat(name, hex32.slice(1), config)).toBe('format');
      expect(checkSecretFormat(name, `${hex32}0`, config)).toBe('format');
      expect(checkSecretFormat(name, hex32.toUpperCase(), config)).toBe('format');
      expect(checkSecretFormat(name, `${hex32.slice(1)}g`, config)).toBe('format');
    }
    const hex64 = SECRETS.R2_SECRET_ACCESS_KEY!;
    expect(checkSecretFormat('R2_SECRET_ACCESS_KEY', hex64.slice(1), config)).toBe('format');
    expect(checkSecretFormat('R2_SECRET_ACCESS_KEY', hex32, config)).toBe('format');
    expect(checkSecretFormat('R2_SECRET_ACCESS_KEY', hex64.toUpperCase(), config)).toBe('format');
  });

  it('formato inesperado: bucket, token e código do projeto do Supabase', () => {
    for (const bad of ['ab', 'Bucket', '-bucket', 'bucket-', 'buc_ket', 'a'.repeat(64)]) {
      expect(checkSecretFormat('R2_BUCKET', bad, config), bad).toBe('format');
    }
    const hex40 = '0123456789abcdef'.repeat(2) + '01234567';
    expect(checkSecretFormat('SUPABASE_ACCESS_TOKEN', `sbp_oauth_${hex40}`, config)).toBe('ok');
    for (const bad of [
      hex40,
      `sbp_${hex40.slice(1)}`,
      `sbp_${hex40}0`,
      `sbp_${hex40.toUpperCase()}`,
      `sbx_${hex40}`,
    ]) {
      expect(checkSecretFormat('SUPABASE_ACCESS_TOKEN', bad, config), bad).toBe('format');
    }
    for (const name of ['SUPABASE_PROJECT_REF', 'RESTORE_TARGET_PROJECT_REF']) {
      for (const bad of [
        'abc',
        'abcdefghijklmnopqrstu',
        'ABCDEFGHIJKLMNOPQRST',
        'abcdefghij1234567890',
      ]) {
        expect(checkSecretFormat(name, bad, config), bad).toBe('format');
      }
    }
  });

  it('frase-senha: tamanho mínimo da configuração e uma linha só', () => {
    const min = config.preflight.passphraseMinLength;
    expect(min).toBeGreaterThanOrEqual(12);
    expect(checkSecretFormat('BACKUP_PASSPHRASE', 'a'.repeat(min - 1), config)).toBe('format');
    expect(checkSecretFormat('BACKUP_PASSPHRASE', 'a'.repeat(min), config)).toBe('ok');
    expect(
      checkSecretFormat('BACKUP_PASSPHRASE', `${'a'.repeat(min)}\n${'b'.repeat(min)}`, config),
    ).toBe('format');
    expect(checkSecretFormat('BACKUP_PASSPHRASE', 'frase com espaços no meio, ok!!', config)).toBe(
      'ok',
    );
  });

  it('nunca devolve o valor: só uma das cinco palavras', () => {
    for (const value of [...SECRET_VALUES, ' x ', '', undefined]) {
      for (const name of SECRET_NAMES) {
        expect(['ok', 'absent', 'empty', 'whitespace', 'format']).toContain(
          checkSecretFormat(name, value, config),
        );
      }
    }
  });

  it('o registro de formato só tem item, resultado e razão', () => {
    const record = formatRecord(
      'R2_SECRET_ACCESS_KEY',
      `${SECRETS.R2_SECRET_ACCESS_KEY}\n`,
      config,
    );
    expect(record).toEqual({
      item: 'fmt.R2_SECRET_ACCESS_KEY',
      result: 'FALHOU',
      reason: 'fmt_whitespace',
    });
  });
});

describe('extractIdentifier: só de posições estruturais e só o que passa na lista estrita', () => {
  it('código entre parênteses de "An error occurred" do aws (v1/v2, com e sem prefixo)', () => {
    expect(extractIdentifier(AWS('SomethingNew', 'ListObjectsV2'))).toBe('SomethingNew');
    expect(
      extractIdentifier(
        'aws: [ERROR]: An error occurred (NoSuchKey) when calling the GetObject operation: x',
      ),
    ).toBe('NoSuchKey');
  });

  it('status HTTP de 3 dígitos', () => {
    expect(extractIdentifier(AWS('418', 'PutObject'))).toBe('418');
    expect(extractIdentifier(AWS('1234', 'PutObject'))).toBeNull();
    expect(extractIdentifier(AWS('999', 'PutObject'))).toBeNull();
    expect(
      extractIdentifier(JSON.stringify({ _tag: 'Error', error: { code: 'X', status: 502 } })),
    ).toBe('X');
    expect(
      extractIdentifier(
        JSON.stringify({ _tag: 'Error', error: { message: 'm', statusCode: 429 } }),
      ),
    ).toBe('429');
  });

  it('campo "code" do JSON de erro da CLI do Supabase (real)', () => {
    expect(
      extractIdentifier(
        `Dumping roles from remote database...\n${SB('DockerRunError', 'failed to inspect docker image')}`,
      ),
    ).toBe('DockerRunError');
  });

  it('recusa o que não casa com ^[A-Za-z][A-Za-z0-9_.]{0,63}$', () => {
    for (const bad of [
      '1Inicio',
      'com espaco',
      '../etc/passwd',
      'a;b',
      'a'.repeat(65),
      '',
      'ação',
    ]) {
      expect(extractIdentifier(AWS(bad, 'ListObjectsV2')), bad).toBeNull();
      expect(
        extractIdentifier(JSON.stringify({ _tag: 'Error', error: { code: bad } })),
        bad,
      ).toBeNull();
    }
    expect(extractIdentifier(AWS('X'.repeat(64), 'ListObjectsV2'))).toBe('X'.repeat(64));
  });

  it('recusa identificador que pareça segredo, chave ou contenha um valor secreto', () => {
    expect(isSafeIdentifier('a1b2c3d4e5f60718293a4b5c6d7e8f90')).toBe(false); // 32 hex começando com letra
    // Montado em pedaços: um literal com a forma de um token real é barrado pela proteção de push do GitHub.
    expect(isSafeIdentifier(['sbp', '0123456789abcdef'.repeat(2) + '01234567'].join('_'))).toBe(
      false,
    );
    expect(isSafeIdentifier('SenhaSecreta', ['SenhaSecreta'])).toBe(false);
    expect(isSafeIdentifier('SenhaSecreta', ['senhasecreta-longa-123'])).toBe(false); // trecho de 8+
    expect(isSafeIdentifier('xSenhaSecretax', ['SenhaSecreta'])).toBe(false);
    expect(isSafeIdentifier('AccessDenied', SECRET_VALUES)).toBe(true);
    for (const value of SECRET_VALUES) {
      expect(extractIdentifier(AWS(value, 'ListObjectsV2'), SECRET_VALUES), value).toBeNull();
    }
  });

  it('ignora tudo que não é estrutural: linha solta, "code=", dado, JSON sem _tag, meio de linha', () => {
    const text = [
      'error code: Vazamento1',
      'code=Vazamento2',
      '{"code":"Vazamento3"}',
      '{"_tag":"Info","error":{"code":"Vazamento4"}}',
      'texto antes An error occurred (Vazamento5) when calling the X operation',
      'registro (Vazamento6) de dado',
      DATA_LINES,
      `{"_tag":"Error","error":"Vazamento7"}`,
    ].join('\n');
    expect(extractIdentifier(text)).toBeNull();
  });

  it('com várias candidatas, só devolve uma que passe; nunca a mensagem', () => {
    const text = `${AWS('1ruim', 'ListObjectsV2', 'Vazamento-da-mensagem')}${SB('CodigoBom', 'Vazamento-da-mensagem-2')}`;
    expect(extractIdentifier(text)).toBe('CodigoBom');
  });
});

describe('classify: amostras de erro por passo', () => {
  const r = (step: string, text: string, exitCode = 254) =>
    classify({ step, exitCode, text, secrets: SECRET_VALUES });

  it('exit 0 é OK, sem olhar o texto', () => {
    expect(classify({ step: 'r2_list', exitCode: 0, text: 'qualquer coisa' })).toEqual({
      item: 'r2_list',
      result: 'OK',
      reason: 'ok',
    });
  });

  it('R2 (real, via moto): chave inválida, assinatura incorreta, bucket inexistente, sem permissão', () => {
    expect(
      r(
        'r2_list',
        AWS(
          'InvalidAccessKeyId',
          'ListObjectsV2',
          'The AWS Access Key Id you provided does not exist in our records.',
        ),
      ).reason,
    ).toBe('r2_key_invalid');
    expect(
      r(
        'r2_list',
        AWS(
          'SignatureDoesNotMatch',
          'ListObjectsV2',
          'The request signature we calculated does not match the signature you provided. Check your key and signing method.',
        ),
      ).reason,
    ).toBe('r2_signature');
    expect(
      r('r2_list', AWS('NoSuchBucket', 'ListObjectsV2', 'The specified bucket does not exist'))
        .reason,
    ).toBe('r2_no_bucket');
    expect(r('r2_put', AWS('AccessDenied', 'PutObject', 'Access Denied')).reason).toBe(
      'r2_write_denied',
    );
  });

  it('R2 (códigos da documentação da Cloudflare): Unauthorized, NotEntitled, InvalidBucketName e serviço', () => {
    expect(r('r2_list', AWS('Unauthorized', 'ListObjectsV2')).reason).toBe('r2_key_invalid');
    expect(r('r2_list', AWS('401', 'ListObjectsV2')).reason).toBe('r2_key_invalid');
    expect(r('r2_list', AWS('NotEntitled', 'ListObjectsV2')).reason).toBe('r2_not_entitled');
    expect(r('r2_list', AWS('InvalidBucketName', 'ListObjectsV2')).reason).toBe(
      'r2_bad_bucket_name',
    );
    for (const code of ['InternalError', 'ServiceUnavailable', 'TooManyRequests', '503', '429']) {
      expect(r('r2_list', AWS(code, 'ListObjectsV2')).reason, code).toBe('r2_service');
    }
  });

  it('R2: AccessDenied muda de razão conforme o passo (listar, gravar, apagar, ler)', () => {
    expect(r('r2_list', AWS('AccessDenied', 'ListObjectsV2')).reason).toBe('r2_list_denied');
    expect(r('r2_put', AWS('AccessDenied', 'PutObject')).reason).toBe('r2_write_denied');
    expect(r('r2_delete', AWS('AccessDenied', 'DeleteObject')).reason).toBe('r2_cannot_delete');
    expect(r('prev_daily_list', AWS('AccessDenied', 'ListObjectsV2')).reason).toBe(
      'r2_read_denied',
    );
    expect(r('prev_weekly_get', AWS('403', 'GetObject')).reason).toBe('r2_read_denied');
  });

  it('R2: endpoint inalcançável (real) e falha de TLS', () => {
    expect(
      r('r2_list', 'Could not connect to the endpoint URL: "http://127.0.0.1:1/bkt?list-type=2"')
        .reason,
    ).toBe('r2_unreachable');
    expect(
      r(
        'r2_list',
        'SSL validation failed for https://x.r2.cloudflarestorage.com/b [SSL: SSLV3_ALERT_HANDSHAKE_FAILURE]',
      ).reason,
    ).toBe('r2_unreachable');
  });

  it('o item do registro é o do passo (gravar e apagar são o mesmo item)', () => {
    expect(r('r2_put', AWS('AccessDenied', 'PutObject')).item).toBe('r2_write');
    expect(r('r2_delete', AWS('AccessDenied', 'DeleteObject')).item).toBe('r2_write');
    expect(r('prev_daily_open', '').item).toBe('prev_daily');
    expect(r('prev_weekly_list', AWS('NoSuchBucket', 'ListObjectsV2')).item).toBe('prev_weekly');
  });

  it('Supabase (real, CLI 2.118): token malformado e token recusado', () => {
    expect(
      r(
        'sb_token',
        SB(
          'InvalidAccessTokenError',
          'Invalid access token format. Must be like `sbp_0102...1920`.',
        ),
        1,
      ).reason,
    ).toBe('sb_token_invalid');
    expect(
      r(
        'sb_token',
        SB(
          'ProjectsListUnexpectedStatusError',
          'Unexpected error retrieving projects: {"message":"Unauthorized"}',
        ),
        1,
      ).reason,
    ).toBe('sb_token_invalid');
    expect(
      r(
        'sb_token',
        'Invalid access token format. Must be like `sbp_0102...1920`.\nTry rerunning',
        1,
      ).reason,
    ).toBe('sb_token_invalid');
  });

  it('Supabase (real): projeto inexistente ou sem acesso, e formato do código', () => {
    expect(
      r(
        'sb_project',
        SB(
          'LinkProjectStatusError',
          'Unexpected error retrieving remote project status: {"message":"Unauthorized"}',
        ),
        1,
      ).reason,
    ).toBe('sb_project_unknown');
    expect(
      r(
        'sb_project',
        SB(
          'LinkProjectStatusError',
          'Unexpected error retrieving remote project status: {"message":"Your account does not have the necessary privileges"}',
        ),
        1,
      ).reason,
    ).toBe('sb_project_unknown');
    expect(
      r(
        'sb_project',
        SB(
          'LinkBranchNotLinkedError',
          'Cannot resolve "abc": it is not a project ref (refs are exactly 20 lowercase letters)',
        ),
        1,
      ).reason,
    ).toBe('sb_project_format');
  });

  it('Supabase (representativa): senha do banco recusada, bloqueio por tentativas e rede', () => {
    const pgx =
      'failed to connect to postgres: failed SASL auth (FATAL: password authentication failed for user "postgres" (SQLSTATE 28P01))';
    expect(r('sb_db', SB('DockerRunError', pgx), 1).reason).toBe('sb_db_password');
    expect(r('sb_db', pgx, 1).reason).toBe('sb_db_password');
    expect(
      r(
        'sb_db',
        'psql: error: connection to server at "aws-0.pooler.supabase.com" failed: FATAL:  password authentication failed for user "postgres.abc"',
        2,
      ).reason,
    ).toBe('sb_db_password');
    expect(
      r('sb_db', 'FATAL: Circuit breaker open: Too many authentication errors', 1).reason,
    ).toBe('sb_db_blocked');
    expect(r('sb_db', 'FATAL: Tenant or user not found', 1).reason).toBe('sb_project_unknown');
    for (const net of [
      'dial tcp: lookup db.abc.supabase.co: no such host',
      'failed to connect to host=x: dial error (dial tcp 1.2.3.4:5432: i/o timeout)',
      'connection refused',
      'context deadline exceeded',
    ]) {
      expect(r('sb_db', net, 1).reason, net).toBe('sb_network');
      expect(r('sb_token', net, 1).reason, net).toBe('sb_network');
      expect(r('sb_project', net, 1).reason, net).toBe('sb_network');
    }
    expect(r('sb_project', pgx, 1).reason).toBe('sb_db_password');
  });

  it('gpg: qualquer falha do ciclo é "gpg_failed"; falha ao abrir o anterior é "prev_wrong"', () => {
    expect(r('gpg_cycle', 'gpg: decryption failed: Bad session key', 2).reason).toBe('gpg_failed');
    expect(r('prev_daily_open', 'gpg: decryption failed: Bad session key', 2).reason).toBe(
      'prev_wrong',
    );
    expect(r('prev_weekly_open', '', 2).reason).toBe('prev_wrong');
  });

  it('o texto do motivo de "prev_wrong" é o pedido: a frase-senha atual NÃO abre os backups anteriores', () => {
    const row = describeRecord(r('prev_daily_open', '', 2), 'backup');
    expect(row.motivo).toContain('A frase-senha atual NÃO abre os backups anteriores');
    expect(row.motivo).toContain('foi trocada ou digitada diferente');
  });

  it('erro desconhecido: só a mensagem genérica, o passo, o código de saída e o identificador permitido', () => {
    const record = r(
      'r2_list',
      noisy(AWS('AlgoNovo', 'ListObjectsV2', `${SECRETS.R2_SECRET_ACCESS_KEY}`)),
    );
    expect(record).toEqual({
      item: 'r2_list',
      result: 'FALHOU',
      reason: 'unclassified',
      step: 'r2_list',
      code: 254,
      ident: 'AlgoNovo',
    });
    const row = describeRecord(record, 'backup');
    expect(row.motivo).toBe(
      'Erro não classificado no passo R2: listar o bucket (código de saída 254). Identificador do erro: AlgoNovo.',
    );
  });

  it('erro desconhecido sem identificador estrutural: nada além de passo e código', () => {
    const record = r('sb_db', noisy('uma falha qualquer\ncode=Falso'), 1);
    expect(record).toEqual({
      item: 'sb_db',
      result: 'FALHOU',
      reason: 'unclassified',
      step: 'sb_db',
      code: 1,
    });
    expect(describeRecord(record, 'backup').motivo).toBe(
      'Erro não classificado no passo Supabase: senha e conexão do banco (código de saída 1).',
    );
  });

  it('JSON do Supabase desconhecido: identificador é o campo "code", nunca a mensagem', () => {
    const record = r(
      'sb_project',
      noisy(SB('NovoErroDaCli', `vazou ${SECRETS.SUPABASE_DB_PASSWORD}`)),
      1,
    );
    expect(record.reason).toBe('unclassified');
    expect(record.ident).toBe('NovoErroDaCli');
  });

  it('código de saída inválido vira 1; passo desconhecido é erro de programação', () => {
    expect(r('sb_db', 'x', 999).code).toBe(1);
    expect(r('sb_db', 'x', -3).code).toBe(1);
    expect(() => classify({ step: 'nao_existe', exitCode: 1, text: '' })).toThrow();
  });
});

describe('classify: nada do texto de entrada vaza', () => {
  const STEPS = [
    'r2_list',
    'r2_put',
    'r2_delete',
    'sb_token',
    'sb_project',
    'sb_db',
    'gpg_cycle',
    'prev_daily_list',
    'prev_daily_get',
    'prev_daily_open',
    'prev_weekly_list',
    'prev_weekly_get',
    'prev_weekly_open',
  ];
  const SAMPLES = [
    AWS('InvalidAccessKeyId', 'ListObjectsV2'),
    AWS('SignatureDoesNotMatch', 'ListObjectsV2'),
    AWS('NoSuchBucket', 'ListObjectsV2'),
    AWS('AccessDenied', 'PutObject'),
    AWS('CodigoNovo', 'PutObject'),
    'Could not connect to the endpoint URL: "https://x.r2.cloudflarestorage.com/b"',
    SB('InvalidAccessTokenError', 'Invalid access token format.'),
    SB('ProjectsListUnexpectedStatusError', '{"message":"Unauthorized"}'),
    SB('LinkProjectStatusError', 'Unauthorized'),
    SB('CodigoNovo', 'mensagem desconhecida'),
    'failed SASL auth (FATAL: password authentication failed (SQLSTATE 28P01))',
    'dial tcp: lookup x: no such host',
    'gpg: decryption failed',
    '',
    'texto sem nenhuma estrutura conhecida',
  ];

  /** Procura valores de segredo, janelas de 12 caracteres deles, e-mail e dado no JSON da saída. */
  function leaks(output: string): string[] {
    const found: string[] = [];
    for (const value of SECRET_VALUES) {
      if (output.includes(value)) found.push(value);
      for (let i = 0; i + 12 <= value.length; i += 1) {
        if (output.includes(value.slice(i, i + 12))) found.push(value.slice(i, i + 12));
      }
    }
    for (const marker of [
      EMAIL,
      'COPY "auth"',
      'id-1',
      'Mensagem da ferramenta',
      'Falso',
      'OutroCodigo',
      'eco:',
    ]) {
      if (output.includes(marker)) found.push(marker);
    }
    if (/[0-9a-f]{20,}/i.test(output) || /sbp_/i.test(output)) found.push('sequência de chave');
    return found;
  }

  for (const step of STEPS) {
    it(`passo ${step}: registro e textos fixos não contêm segredo, dado nem mensagem`, () => {
      for (const sample of SAMPLES) {
        const record = classify({
          step,
          exitCode: 254,
          text: noisy(sample),
          secrets: SECRET_VALUES,
        });
        for (const scope of Object.keys(SCOPES)) {
          const row = describeRecord(record, scope, config.preflight);
          const output = JSON.stringify([record, row]);
          expect(leaks(output), `${step} | ${sample.slice(0, 40)}`).toEqual([]);
        }
        // Só estas chaves, e a razão é sempre uma das fixas.
        expect(
          Object.keys(record).every((key) =>
            ['item', 'result', 'reason', 'step', 'code', 'ident'].includes(key),
          ),
        ).toBe(true);
        expect(REASON_IDS).toContain(record.reason);
        if (record.ident !== undefined) {
          expect(record.ident).toMatch(/^([A-Za-z][A-Za-z0-9_.]{0,63}|[1-5][0-9]{2})$/);
        }
      }
    });

    it(`passo ${step}: o resultado não depende do ruído (salvo o identificador)`, () => {
      for (const sample of SAMPLES) {
        const clean = classify({ step, exitCode: 254, text: sample, secrets: SECRET_VALUES });
        const dirty = classify({
          step,
          exitCode: 254,
          text: noisy(sample),
          secrets: SECRET_VALUES,
        });
        expect(dirty).toEqual(clean);
      }
    });
  }

  it('um erro desconhecido cheio de segredos e dados só deixa sair o identificador permitido', () => {
    const text = [
      `An error occurred (Permitido) when calling the X operation: ${EMAIL}`,
      ...SECRET_VALUES.map(
        (value) => `An error occurred (${value}) when calling the X operation: ${value}`,
      ),
      DATA_LINES,
    ].join('\n');
    const record = classify({ step: 'r2_list', exitCode: 254, text, secrets: SECRET_VALUES });
    expect(record).toMatchObject({ reason: 'unclassified', ident: 'Permitido' });
    expect(leaks(JSON.stringify([record, describeRecord(record, 'backup')]))).toEqual([]);
  });

  it('com o identificador em posição não estrutural, nada sai', () => {
    const record = classify({
      step: 'r2_put',
      exitCode: 255,
      text: `${DATA_LINES}\nerro (Permitido) na linha 3\n${EMAIL}`,
      secrets: SECRET_VALUES,
    });
    expect(record).toEqual({
      item: 'r2_write',
      result: 'FALHOU',
      reason: 'unclassified',
      step: 'r2_put',
      code: 255,
    });
  });
});

describe('registros: validação', () => {
  it('aceita só item, resultado e razão conhecidos e coerentes', () => {
    expect(sanitizeRecord({ item: 'r2_list', result: 'OK', reason: 'ok' })).toEqual({
      item: 'r2_list',
      result: 'OK',
      reason: 'ok',
    });
    expect(sanitizeRecord({ item: 'r2_list', result: 'OK', reason: 'r2_signature' })).toBeNull();
    expect(sanitizeRecord({ item: 'r2_list', result: 'FALHOU', reason: 'ok' })).toBeNull();
    expect(sanitizeRecord({ item: 'nao_existe', result: 'OK', reason: 'ok' })).toBeNull();
    expect(sanitizeRecord({ item: 'fmt.R2_BUCKET', result: 'TALVEZ', reason: 'ok' })).toBeNull();
    expect(sanitizeRecord({ item: 'internal', result: 'OK', reason: 'ok' })).toBeNull();
    expect(sanitizeRecord(null)).toBeNull();
    expect(sanitizeRecord('texto')).toBeNull();
  });

  it('"unclassified" exige passo, código e um identificador válido; ignora campos extras', () => {
    const base = {
      item: 'r2_list',
      result: 'FALHOU',
      reason: 'unclassified',
      step: 'r2_list',
      code: 254,
    };
    expect(sanitizeRecord(base)).toEqual(base);
    expect(sanitizeRecord({ ...base, ident: 'Bom', extra: 'mensagem' })).toEqual({
      ...base,
      ident: 'Bom',
    });
    expect(sanitizeRecord({ ...base, ident: 'com espaço' })).toBeNull();
    expect(sanitizeRecord({ ...base, ident: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' })).toBeNull();
    expect(sanitizeRecord({ ...base, code: 0 })).toBeNull();
    expect(sanitizeRecord({ ...base, code: 300 })).toBeNull();
    expect(sanitizeRecord({ ...base, step: 'nao_existe' })).toBeNull();
  });

  it('o arquivo de resultados tolera linhas inválidas sem mostrá-las', () => {
    const text = [
      JSON.stringify({ item: 'r2_list', result: 'OK', reason: 'ok' }),
      'não é json',
      JSON.stringify({ item: 'r2_list', result: 'OK', reason: 'mensagem-livre' }),
      '',
    ].join('\n');
    const { records, invalid } = parseRecords(text);
    expect(records).toHaveLength(1);
    expect(invalid).toBe(2);
  });

  it('falha interna: só o passo e o código', () => {
    expect(internalFailure('r2_put', 7)).toEqual({
      item: 'internal',
      result: 'FALHOU',
      reason: 'unclassified',
      step: 'r2_put',
      code: 7,
    });
    expect(internalFailure('qualquer-coisa-fora-da-lista', 300)).toEqual({
      item: 'internal',
      result: 'FALHOU',
      reason: 'unclassified',
      step: 'setup',
      code: 1,
    });
  });
});

describe('evaluatePreflight: um PULADO nunca esconde um FALHOU', () => {
  const ok = (item: string): PreflightRecord => ({ item, result: 'OK', reason: 'ok' });
  const fail = (item: string, reason: string): PreflightRecord => ({
    item,
    result: 'FALHOU',
    reason,
  });
  const skip = (item: string, reason = 'skipped_dependency'): PreflightRecord => ({
    item,
    result: 'PULADO',
    reason,
  });

  const allOk = (scope: string) => SCOPES[scope]!.items.map(ok);
  const replace = (records: PreflightRecord[], ...changes: PreflightRecord[]) =>
    records.map((record) => changes.find((change) => change.item === record.item) ?? record);

  it('tudo OK: o job passa', () => {
    for (const scope of Object.keys(SCOPES)) {
      const evaluation = evaluatePreflight(allOk(scope), scope);
      expect(evaluation.failed, scope).toBe(false);
      expect(evaluation.counts).toEqual({
        total: SCOPES[scope]!.items.length,
        failed: 0,
        skipped: 0,
      });
    }
  });

  it('qualquer FALHOU falha o job, mesmo com vários PULADO', () => {
    const records = replace(
      allOk('backup'),
      fail('sb_token', 'sb_token_invalid'),
      skip('sb_project'),
      skip('sb_db'),
    );
    const evaluation = evaluatePreflight(records, 'backup');
    expect(evaluation.failed).toBe(true);
    expect(evaluation.counts).toMatchObject({ failed: 1, skipped: 2 });
  });

  it('PULADO de propósito (frase trocada) sozinho não falha o job', () => {
    const records = replace(allOk('backup'), skip('prev_daily', 'skipped_rotated'));
    const evaluation = evaluatePreflight(records, 'backup');
    expect(evaluation.failed).toBe(false);
    expect(evaluation.counts.skipped).toBe(1);
  });

  it('PULADO por dependência sem nenhuma falha de que dependa vira FALHOU (inconsistente)', () => {
    const records = replace(allOk('backup'), skip('sb_project'));
    const evaluation = evaluatePreflight(records, 'backup');
    expect(evaluation.failed).toBe(true);
    expect(evaluation.records.find((r) => r.item === 'sb_project')).toEqual(
      fail('sb_project', 'inconsistent'),
    );
  });

  it('PULADO por dependência vale quando o item de que depende falhou (inclusive formato ausente)', () => {
    const records = replace(
      allOk('backup'),
      fail('fmt.R2_BUCKET', 'fmt_absent'),
      skip('r2_list'),
      skip('r2_write'),
      skip('prev_daily'),
    );
    const evaluation = evaluatePreflight(records, 'backup');
    expect(evaluation.failed).toBe(true);
    expect(evaluation.records.filter((r) => r.reason === 'inconsistent')).toEqual([]);
  });

  it('item sem registro vira FALHOU (a pré-verificação foi interrompida)', () => {
    const evaluation = evaluatePreflight(allOk('drill').slice(0, 3), 'drill');
    expect(evaluation.failed).toBe(true);
    const missing = evaluation.records.filter((r) => r.reason === 'not_run');
    expect(missing.map((r) => r.item)).toEqual(SCOPES.drill!.items.slice(3));
  });

  it('registro inválido no arquivo falha o job', () => {
    const evaluation = evaluatePreflight(allOk('drill'), 'drill', { invalid: 1 });
    expect(evaluation.failed).toBe(true);
    expect(evaluation.records.at(-1)).toEqual({
      item: 'internal',
      result: 'FALHOU',
      reason: 'inconsistent',
    });
  });

  it('erro interno do passo falha o job e aparece no fim da tabela', () => {
    const evaluation = evaluatePreflight(
      [...allOk('drill'), internalFailure('gpg_cycle', 2)],
      'drill',
    );
    expect(evaluation.failed).toBe(true);
    expect(evaluation.records.at(-1)!.item).toBe('internal');
  });

  it('registro de outro escopo é ignorado', () => {
    const evaluation = evaluatePreflight([...allOk('drill'), fail('sb_db', 'sb_network')], 'drill');
    expect(evaluation.failed).toBe(false);
  });

  it('restore: segredos de destino ainda não criados são PULADO e não falham o job', () => {
    const target = skip('x', 'target_not_created');
    const records = replace(
      allOk('check-restore'),
      ...[
        'fmt.SUPABASE_ACCESS_TOKEN',
        'fmt.RESTORE_TARGET_PROJECT_REF',
        'fmt.RESTORE_TARGET_DB_PASSWORD',
        'sb_token',
        'sb_project',
        'sb_db',
      ].map((item) => ({ ...target, item })),
    );
    const evaluation = evaluatePreflight(records, 'check-restore');
    expect(evaluation.failed).toBe(false);
    expect(evaluation.counts.skipped).toBe(6);
  });
});

describe('escopos: a escrita no R2 nunca roda onde não deve', () => {
  it('só backup, check-backup e selftest gravam; drill e restore são só leitura', () => {
    const writers = Object.entries(SCOPES)
      .filter(([, scope]) => scope.items.includes('r2_write'))
      .map(([name]) => name)
      .sort();
    expect(writers).toEqual(['backup', 'check-backup', 'selftest']);
    expect(SCOPES['check-restore']!.items).not.toContain('r2_write');
    expect(SCOPES.drill!.items).not.toContain('r2_write');
  });

  it('check-restore usa o Environment restore; os demais, backup', () => {
    expect(SCOPES['check-restore']!.environment).toBe('restore');
    for (const name of ['backup', 'drill', 'check-backup', 'selftest']) {
      expect(SCOPES[name]!.environment).toBe('backup');
    }
  });

  it('o backup real confere todos os 8 segredos, e o drill só os do R2 e a frase-senha', () => {
    const formats = (scope: string) =>
      SCOPES[scope]!.items.filter((item) => item.startsWith('fmt.')).map((item) => item.slice(4));
    expect(formats('backup').sort()).toEqual(
      [
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET',
        'BACKUP_PASSPHRASE',
        'SUPABASE_ACCESS_TOKEN',
        'SUPABASE_DB_PASSWORD',
        'SUPABASE_PROJECT_REF',
      ].sort(),
    );
    expect(formats('drill').sort()).toEqual(
      [
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET',
        'BACKUP_PASSPHRASE',
      ].sort(),
    );
  });

  it('todo item de todo escopo tem texto (descreve um registro OK sem erro)', () => {
    for (const [name, scope] of Object.entries(SCOPES)) {
      for (const item of scope.items) {
        const row = describeRecord({ item, result: 'OK', reason: 'ok' }, name);
        expect(row.label.length).toBeGreaterThan(3);
        expect(row.motivo.length).toBeGreaterThan(3);
      }
    }
  });
});

describe('textos fixos: resumo, anotações e log', () => {
  const failing = (scope: string, reasonFor: (item: string) => string | null) => {
    const records = SCOPES[scope]!.items.map((item): PreflightRecord => {
      const reason = reasonFor(item);
      return reason ? { item, result: 'FALHOU', reason } : { item, result: 'OK', reason: 'ok' };
    });
    return evaluatePreflight(records, scope);
  };

  it('toda razão tem motivo e instrução, sem "|" nem quebra de linha (cabe numa célula da tabela)', () => {
    for (const reason of REASON_IDS) {
      for (const scope of Object.keys(SCOPES)) {
        const result = ['ok', 'prev_none'].includes(reason)
          ? 'OK'
          : ['skipped_rotated', 'skipped_dependency', 'target_not_created'].includes(reason)
            ? 'PULADO'
            : 'FALHOU';
        const item = reason.startsWith('fmt_') ? 'fmt.R2_BUCKET' : 'r2_list';
        const base: PreflightRecord = { item, result, reason } as PreflightRecord;
        const record = reason === 'unclassified' ? { ...base, step: 'r2_list', code: 1 } : base;
        const row = describeRecord(record, scope, config.preflight);
        for (const cell of [row.label, row.motivo, row.acao]) {
          expect(cell, `${reason}/${scope}`).not.toMatch(/[|\n\r]/);
        }
        if (reason !== 'ok') expect(row.motivo.length).toBeGreaterThan(5);
        expect(row.acao.length).toBeGreaterThan(0);
      }
    }
  });

  it('o texto de falha cita o Environment certo e o nome do segredo', () => {
    const backup = describeRecord(
      { item: 'fmt.R2_SECRET_ACCESS_KEY', result: 'FALHOU', reason: 'fmt_whitespace' },
      'backup',
    );
    expect(backup.motivo).toBe('R2_SECRET_ACCESS_KEY com espaço ou quebra de linha sobrando.');
    expect(backup.acao).toContain("Environment 'backup' (Settings → Environments → backup)");
    const restore = describeRecord(
      { item: 'fmt.R2_SECRET_ACCESS_KEY', result: 'FALHOU', reason: 'fmt_absent' },
      'check-restore',
    );
    expect(restore.motivo).toBe('R2_SECRET_ACCESS_KEY ausente.');
    expect(restore.acao).toContain("Environment 'restore'");
    const secret = describeRecord(
      { item: 'r2_list', result: 'FALHOU', reason: 'r2_signature' },
      'backup',
    );
    expect(secret.acao).toContain('R2_SECRET_ACCESS_KEY');
    expect(secret.acao).toContain("Environment 'backup'");
  });

  it('o formato inesperado diz o formato esperado, nunca o observado', () => {
    const row = describeRecord(
      { item: 'fmt.R2_SECRET_ACCESS_KEY', result: 'FALHOU', reason: 'fmt_format' },
      'backup',
      config.preflight,
    );
    expect(row.acao).toContain('64 caracteres hexadecimais');
    const pass = describeRecord(
      { item: 'fmt.BACKUP_PASSPHRASE', result: 'FALHOU', reason: 'fmt_format' },
      'backup',
      config.preflight,
    );
    expect(pass.acao).toContain('uma linha só');
  });

  it('a tabela do resumo tem as quatro colunas e uma linha por item', () => {
    const evaluation = failing('backup', (item) => (item === 'r2_list' ? 'r2_signature' : null));
    const md = renderPreflightSummary(evaluation, config.preflight);
    expect(md).toContain('| Item | Resultado | Motivo | O que fazer |');
    const rows = md
      .split('\n')
      .filter(
        (line) => /^\| /.test(line) && !line.includes('| Item |') && !line.startsWith('| ---'),
      );
    expect(rows).toHaveLength(SCOPES.backup!.items.length);
    for (const row of rows) expect(row.split(' | ')).toHaveLength(4);
    expect(md).toContain('**Resultado: FALHOU** (1 de 15 verificações)');
    expect(md).toContain('R2_SECRET_ACCESS_KEY incorreta');
  });

  it('resumo todo OK diz OK', () => {
    const md = renderPreflightSummary(
      failing('drill', () => null),
      config.preflight,
    );
    expect(md).toContain('**Resultado: OK**');
    expect(md).not.toContain('FALHOU');
  });

  it('frase trocada de propósito: o resumo diz que foi PULADA DE PROPÓSITO e lembra do force_weekly', () => {
    const records = SCOPES.backup!.items.map((item): PreflightRecord =>
      item === 'prev_daily'
        ? { item, result: 'PULADO', reason: 'skipped_rotated' }
        : { item, result: 'OK', reason: 'ok' },
    );
    const evaluation = evaluatePreflight(records, 'backup');
    const md = renderPreflightSummary(evaluation, config.preflight);
    expect(md).toContain('pulada de propósito');
    expect(md).toContain('passphrase_rotated');
    expect(md).toContain('force_weekly');
    expect(md).toContain('backup diário mais recente passar a abrir com a frase nova');
    expect(md).toContain('⏭️ PULADO');
    expect(md).toContain('**Resultado: OK** (15 verificações, 1 puladas)');
    const annotations = preflightAnnotations(evaluation, config.preflight);
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatch(/^::warning title=Frase-senha pulada de propósito::/);
    expect(annotations[0]).toContain('force_weekly');
  });

  it('sem frase trocada, o resumo não traz o aviso', () => {
    const md = renderPreflightSummary(
      failing('backup', () => null),
      config.preflight,
    );
    expect(md).not.toContain('pulada de propósito');
  });

  it('anotações: uma por item que falhou, com título e texto fixos e seguros', () => {
    const evaluation = failing('backup', (item) =>
      item === 'fmt.R2_BUCKET' ? 'fmt_absent' : item === 'sb_token' ? 'sb_token_invalid' : null,
    );
    const lines = preflightAnnotations(evaluation, config.preflight);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(/^::error title=[^,:\n%=]+::[^\n%]+$/);
    }
    expect(lines[0]).toContain('title=R2_BUCKET formato::R2_BUCKET ausente.');
    expect(lines[1]).toContain('title=Supabase token de acesso::');
  });

  it('anotações nunca passam de 10 erros por passo (o GitHub corta o excesso)', () => {
    const evaluation = failing('backup', () => 'not_run');
    const lines = preflightAnnotations(evaluation, config.preflight);
    expect(lines.filter((line) => line.startsWith('::error'))).toHaveLength(10);
    expect(lines.at(-1)).toContain('Mais falhas');
  });

  it('todas as anotações, de todas as razões e escopos, têm título e texto seguros', () => {
    for (const scope of Object.keys(SCOPES)) {
      for (const reason of REASON_IDS) {
        if (
          [
            'ok',
            'prev_none',
            'skipped_rotated',
            'skipped_dependency',
            'target_not_created',
          ].includes(reason)
        )
          continue;
        const item = reason.startsWith('fmt_') ? 'fmt.R2_BUCKET' : 'r2_list';
        const base = { item, result: 'FALHOU', reason } as PreflightRecord;
        const record =
          reason === 'unclassified' ? { ...base, step: 'r2_list', code: 3, ident: 'X.y_1' } : base;
        const evaluation = {
          scope,
          records: [record],
          failed: true,
          counts: { total: 1, failed: 1, skipped: 0 },
        };
        const [line] = preflightAnnotations(evaluation, config.preflight);
        expect(line, `${scope}/${reason}`).toMatch(/^::error title=[^,:\n%=]+::[^\n%]+$/);
      }
    }
  });

  it('o log do passo tem uma linha por item, com o resultado e o texto fixo', () => {
    const evaluation = failing('drill', (item) => (item === 'gpg_cycle' ? 'gpg_failed' : null));
    const lines = preflightLogLines(evaluation, config.preflight);
    expect(lines).toHaveLength(SCOPES.drill!.items.length);
    expect(lines.filter((line) => line.startsWith('[FALHOU]'))).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith('[OK]'))).toHaveLength(
      SCOPES.drill!.items.length - 1,
    );
  });
});
