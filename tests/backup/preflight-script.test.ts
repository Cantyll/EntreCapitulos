import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { SCOPES } from '../../scripts/backup/lib.mjs';

import {
  BACKUP_SECRETS,
  DAILY_KEY,
  OTHER_PASSPHRASE,
  ROOT,
  SECRETS,
  WEEKLY_KEY,
  byItem,
  crashBin,
  expectNoLeak,
  expectNoLeftovers,
  fixtures,
  harnessPaths,
  installHarness,
  procEnv,
  run,
  type Overrides,
} from './preflight-harness';

/*
 * preflight.sh de ponta a ponta, com `aws`, `supabase` e `psql` FALSOS que imprimem erros no formato das
 * ferramentas reais, SEMPRE misturados a segredos, e-mail e linhas de dado (ver preflight-harness.ts). O gpg é
 * o de verdade. Prova: todas as verificações rodam, o resultado sai em texto fixo, nada vaza para o log nem
 * para o resumo, e a escrita no R2 nunca acontece onde não deve.
 */
installHarness();

vi.setConfig({ testTimeout: 30_000 });

describe('preflight.sh: tudo certo', () => {
  it('backup: todas as verificações OK, nada vaza e nada sobra no disco', () => {
    const r = run('backup', { FAKE_DAILY_JSON: fixtures.dailyJson });
    expect(r.status).toBe(0);
    expect(r.records.map((record) => record.item)).toEqual(SCOPES.backup!.items);
    expect(r.records.every((record) => record.result === 'OK')).toBe(true);
    expect(byItem(r, 'prev_daily')).toEqual({ item: 'prev_daily', result: 'OK', reason: 'ok' });
    expectNoLeak(r.output);
    expectNoLeak(r.summary());
    expectNoLeftovers(r);
    expect(r.summary()).toContain('**Resultado: OK**');
  });

  it('backup: o dump de teste é o dos roles, no mesmo mecanismo do dump real, e o arquivo é descartado', () => {
    const r = run('backup');
    expect(r.calls.filter((call) => call.startsWith('supabase db dump'))).toEqual([
      expect.stringMatching(/^supabase db dump --linked --role-only -f .*\/preflight\/roles\.sql$/),
    ]);
    expect(existsSync(join(r.dir, 'preflight', 'roles.sql'))).toBe(false);
  });

  it('backup: escreve só em _preflight/ (chave única da execução) e apaga; nunca em daily/ nem weekly/', () => {
    const r = run('backup', { FAKE_DAILY_JSON: fixtures.dailyJson });
    const writes = r.calls.filter((call) => /^(put-object|delete-object|copy-object) /.test(call));
    expect(writes).toEqual([
      'put-object _preflight/12345-1.txt',
      'delete-object _preflight/12345-1.txt',
    ]);
    expect(r.calls.some((call) => call.startsWith('copy-object'))).toBe(false);
    // Lê daily/ só para listar e baixar.
    expect(r.calls).toContain('list-objects-v2 daily/');
    expect(r.calls).toContain(`get-object ${DAILY_KEY}`);
  });

  it('o log tem uma linha por item e nenhuma anotação de erro', () => {
    const r = run('backup');
    const lines = r.output.split('\n').filter((line) => /^\[(OK|FALHOU|PULADO)\] /.test(line));
    expect(lines).toHaveLength(SCOPES.backup!.items.length);
    expect(r.output).not.toContain('::error');
  });

  it('drill: só leitura no R2, sem Supabase, e abre o backup semanal', () => {
    const r = run('drill', { FAKE_WEEKLY_JSON: fixtures.weeklyJson });
    expect(r.status).toBe(0);
    expect(r.records.map((record) => record.item)).toEqual(SCOPES.drill!.items);
    expect(r.calls.some((call) => /^(put-object|delete-object|copy-object)/.test(call))).toBe(
      false,
    );
    expect(r.calls.some((call) => call.startsWith('supabase'))).toBe(false);
    expect(r.calls).toContain(`get-object ${WEEKLY_KEY}`);
    expect(byItem(r, 'prev_weekly')!.result).toBe('OK');
    expectNoLeak(r.output);
  });

  it('o ruído do get-object no backup antigo (ok) também não vaza: nada é impresso do gpg', () => {
    const r = run('backup', { FAKE_DAILY_JSON: fixtures.dailyJson });
    expect(r.output).not.toContain('gpg:');
    expect(r.output).not.toContain('conteudo sintetico');
  });
});

describe('preflight.sh: R2, em passos separados e com todas as verificações rodando', () => {
  const ALL_LABELS = (scope: string) => SCOPES[scope]!.items.length;

  const cases: [string, Overrides, string][] = [
    ['bucket inexistente', { FAKE_AWS_LIST: 'no_bucket' }, 'r2_no_bucket'],
    ['sem acesso ao bucket', { FAKE_AWS_LIST: 'denied' }, 'r2_list_denied'],
    ['serviço indisponível', { FAKE_AWS_LIST: 'service' }, 'r2_service'],
    [
      'chave de acesso inválida',
      { R2_ACCESS_KEY_ID: '00112233445566778899aabbccddeeff' },
      'r2_key_invalid',
    ],
    [
      'chave secreta incorreta (assinatura não confere)',
      { R2_SECRET_ACCESS_KEY: 'f'.repeat(64) },
      'r2_signature',
    ],
    [
      'ID da conta errado (endpoint inalcançável)',
      { R2_ACCOUNT_ID: '11112222333344445555666677778888' },
      'r2_unreachable',
    ],
  ];
  it.each(cases)('%s', (_name, overrides, reason) => {
    const r = run('backup', overrides);
    expect(r.status).toBe(1);
    expect(byItem(r, 'r2_list')).toEqual({ item: 'r2_list', result: 'FALHOU', reason });
    // Dependentes pulados; o resto continua rodando (todos os problemas de uma vez).
    expect(byItem(r, 'r2_write')).toMatchObject({ result: 'PULADO', reason: 'skipped_dependency' });
    expect(byItem(r, 'prev_daily')).toMatchObject({
      result: 'PULADO',
      reason: 'skipped_dependency',
    });
    expect(byItem(r, 'sb_token')!.result).toBe('OK');
    expect(byItem(r, 'sb_db')!.result).toBe('OK');
    expect(byItem(r, 'gpg_cycle')!.result).toBe('OK');
    expect(r.records).toHaveLength(ALL_LABELS('backup'));
    expect(r.calls.some((call) => /^(put-object|delete-object)/.test(call))).toBe(false);
    expect(r.output).toContain('::error title=R2 listagem do bucket::');
    expectNoLeak(r.output, overrides.R2_SECRET_ACCESS_KEY ? [overrides.R2_SECRET_ACCESS_KEY] : []);
    expectNoLeak(
      r.summary(),
      overrides.R2_SECRET_ACCESS_KEY ? [overrides.R2_SECRET_ACCESS_KEY] : [],
    );
    expectNoLeftovers(r);
  });

  it('o token só lê: a listagem passa e a escrita falha, sem apagar nada', () => {
    const r = run('backup', { FAKE_AWS_PUT: 'denied' });
    expect(r.status).toBe(1);
    expect(byItem(r, 'r2_list')!.result).toBe('OK');
    expect(byItem(r, 'r2_write')).toEqual({
      item: 'r2_write',
      result: 'FALHOU',
      reason: 'r2_write_denied',
    });
    expect(r.calls.filter((call) => call.startsWith('delete-object'))).toEqual([]);
    expect(byItem(r, 'prev_daily')!.result).toBe('OK');
    expectNoLeak(r.output);
  });

  it('grava mas não apaga: a falha diz isso', () => {
    const r = run('backup', { FAKE_AWS_DELETE: 'denied' });
    expect(byItem(r, 'r2_write')).toEqual({
      item: 'r2_write',
      result: 'FALHOU',
      reason: 'r2_cannot_delete',
    });
    expectNoLeak(r.output);
  });

  it('o resumo traz o motivo e o que fazer, com o Environment certo, e nada mais', () => {
    const r = run('backup', { R2_SECRET_ACCESS_KEY: 'f'.repeat(64) });
    const summary = r.summary();
    expect(summary).toContain('**Resultado: FALHOU**');
    expect(summary).toContain('R2_SECRET_ACCESS_KEY incorreta');
    expect(summary).toContain("Environment 'backup' (Settings → Environments → backup)");
    expect(summary).toContain('⏭️ PULADO');
    expectNoLeak(summary, ['f'.repeat(64)]);
  });
});

describe('preflight.sh: Supabase, na ordem do backup', () => {
  it('token inválido: projeto e senha ficam pulados, o resto roda', () => {
    const r = run('backup', { FAKE_SB_TOKEN: 'invalid' });
    expect(r.status).toBe(1);
    expect(byItem(r, 'sb_token')).toEqual({
      item: 'sb_token',
      result: 'FALHOU',
      reason: 'sb_token_invalid',
    });
    expect(byItem(r, 'sb_project')).toMatchObject({
      result: 'PULADO',
      reason: 'skipped_dependency',
    });
    expect(byItem(r, 'sb_db')).toMatchObject({ result: 'PULADO', reason: 'skipped_dependency' });
    expect(byItem(r, 'r2_write')!.result).toBe('OK');
    expect(r.output).toContain('::error title=Supabase token de acesso::');
    expect(r.calls.filter((call) => call.startsWith('supabase db dump'))).toEqual([]);
    expectNoLeak(r.output);
    expectNoLeak(r.summary());
    expectNoLeftovers(r);
  });

  it('código do projeto inexistente ou sem acesso', () => {
    const r = run('backup', { FAKE_SB_PROJECT: 'unknown' });
    expect(byItem(r, 'sb_token')!.result).toBe('OK');
    expect(byItem(r, 'sb_project')).toEqual({
      item: 'sb_project',
      result: 'FALHOU',
      reason: 'sb_project_unknown',
    });
    expect(byItem(r, 'sb_db')).toMatchObject({ result: 'PULADO' });
    expectNoLeak(r.output);
  });

  it('senha do banco recusada', () => {
    const r = run('backup', { FAKE_SB_DB: 'password' });
    expect(byItem(r, 'sb_project')!.result).toBe('OK');
    expect(byItem(r, 'sb_db')).toEqual({
      item: 'sb_db',
      result: 'FALHOU',
      reason: 'sb_db_password',
    });
    expectNoLeak(r.output);
    expectNoLeak(r.summary());
  });

  it('falha de conexão ou de rede é um quarto caso, distinto', () => {
    const r = run('backup', { FAKE_SB_DB: 'network' });
    expect(byItem(r, 'sb_db')).toEqual({ item: 'sb_db', result: 'FALHOU', reason: 'sb_network' });
    const t = run('backup', { FAKE_SB_TOKEN: 'network' });
    expect(byItem(t, 'sb_token')).toEqual({
      item: 'sb_token',
      result: 'FALHOU',
      reason: 'sb_network',
    });
    expectNoLeak(r.output);
    expectNoLeak(t.output);
  });
});

describe('preflight.sh: frase-senha', () => {
  it('um backup anterior que a frase atual NÃO abre é FALHOU (a frase foi trocada ou digitada diferente)', () => {
    const r = run('backup', {
      FAKE_DAILY_JSON: fixtures.dailyJson,
      FAKE_DAILY_GPG: fixtures.dailyOther,
    });
    expect(r.status).toBe(1);
    expect(byItem(r, 'gpg_cycle')!.result).toBe('OK');
    expect(byItem(r, 'prev_daily')).toEqual({
      item: 'prev_daily',
      result: 'FALHOU',
      reason: 'prev_wrong',
    });
    expect(r.output).toContain('A frase-senha atual NÃO abre os backups anteriores');
    expect(r.output).toContain('::error title=Frase-senha e backup diário::');
    expectNoLeak(r.output, [OTHER_PASSPHRASE]);
    expectNoLeak(r.summary(), [OTHER_PASSPHRASE]);
    expectNoLeftovers(r);
  });

  it('sem backup anterior: OK e diz "sem backup anterior para comparar"', () => {
    const r = run('backup');
    expect(byItem(r, 'prev_daily')).toEqual({
      item: 'prev_daily',
      result: 'OK',
      reason: 'prev_none',
    });
    expect(r.output).toContain('Sem backup anterior para comparar.');
    expect(r.calls.some((call) => call.startsWith('get-object'))).toBe(false);
  });

  it('só considera objetos com nome de backup (ignora o que não é daily/AAAA-MM-DD.tar.gpg)', () => {
    const odd = join(harnessPaths().tmp, 'odd.json');
    writeFileSync(
      odd,
      JSON.stringify([
        { key: 'daily/zzz-estranho', size: 1, lastModified: '2026-10-04T00:00:00Z' },
      ]),
    );
    const r = run('backup', { FAKE_DAILY_JSON: odd });
    expect(byItem(r, 'prev_daily')).toEqual({
      item: 'prev_daily',
      result: 'OK',
      reason: 'prev_none',
    });
  });

  it('passphrase_rotated em disparo manual: pula a comparação de propósito e avisa', () => {
    const r = run('backup', {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      PREFLIGHT_PASSPHRASE_ROTATED: 'true',
      FAKE_DAILY_JSON: fixtures.dailyJson,
      FAKE_DAILY_GPG: fixtures.dailyOther,
    });
    expect(r.status).toBe(0);
    expect(byItem(r, 'prev_daily')).toEqual({
      item: 'prev_daily',
      result: 'PULADO',
      reason: 'skipped_rotated',
    });
    expect(r.calls.some((call) => call.startsWith('get-object'))).toBe(false);
    expect(r.output).toContain('::warning title=Frase-senha pulada de propósito::');
    expect(r.output).toContain('force_weekly');
    const summary = r.summary();
    expect(summary).toContain('pulada de propósito');
    expect(summary).toContain('force_weekly');
    expect(summary).toContain('backup diário mais recente passar a abrir com a frase nova');
    expect(summary).toContain('**Resultado: OK**');
    expectNoLeak(r.output, [OTHER_PASSPHRASE]);
  });

  it('passphrase_rotated nunca vale fora do disparo manual (nem em schedule)', () => {
    const r = run('backup', {
      GITHUB_EVENT_NAME: 'schedule',
      PREFLIGHT_PASSPHRASE_ROTATED: 'true',
      FAKE_DAILY_JSON: fixtures.dailyJson,
      FAKE_DAILY_GPG: fixtures.dailyOther,
    });
    expect(r.status).toBe(1);
    expect(byItem(r, 'prev_daily')).toMatchObject({ result: 'FALHOU', reason: 'prev_wrong' });
  });

  it('passphrase_rotated pula só a comparação: uma falha de verdade continua derrubando o job', () => {
    const r = run('backup', {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      PREFLIGHT_PASSPHRASE_ROTATED: 'true',
      FAKE_SB_TOKEN: 'invalid',
    });
    expect(r.status).toBe(1);
    expect(byItem(r, 'prev_daily')).toMatchObject({ result: 'PULADO', reason: 'skipped_rotated' });
    expect(byItem(r, 'sb_token')!.result).toBe('FALHOU');
  });
});

describe('preflight.sh: presença, formato e valores aparados', () => {
  it('espaço ou quebra de linha sobrando: o formato falha, mas os testes funcionais usam o valor aparado e passam', () => {
    const r = run('backup', { R2_SECRET_ACCESS_KEY: `${SECRETS.R2_SECRET_ACCESS_KEY}\n` });
    expect(r.status).toBe(1);
    expect(byItem(r, 'fmt.R2_SECRET_ACCESS_KEY')).toEqual({
      item: 'fmt.R2_SECRET_ACCESS_KEY',
      result: 'FALHOU',
      reason: 'fmt_whitespace',
    });
    expect(byItem(r, 'r2_list')!.result).toBe('OK'); // com o valor aparado
    expect(byItem(r, 'r2_write')!.result).toBe('OK');
    expect(r.output).toContain('R2_SECRET_ACCESS_KEY com espaço ou quebra de linha sobrando.');
    // O valor aparado passa por ::add-mask:: antes de qualquer uso; só ele (os demais são idênticos aos segredos).
    const masks = r.output.split('\n').filter((line) => line.startsWith('::add-mask::'));
    expect(masks).toEqual([`::add-mask::${SECRETS.R2_SECRET_ACCESS_KEY}`]);
    expect(r.output.indexOf('::add-mask::')).toBeLessThan(r.output.indexOf('[OK]'));
    expectNoLeak(r.output);
    expectNoLeak(r.summary());
  });

  it('segredos intactos não geram ::add-mask:: (o GitHub já mascara o valor inteiro)', () => {
    const r = run('backup');
    expect(r.output).not.toContain('::add-mask::');
  });

  it('segredo ausente: falha o formato e pula o que depende dele', () => {
    const r = run('backup', { R2_BUCKET: undefined });
    expect(r.status).toBe(1);
    expect(byItem(r, 'fmt.R2_BUCKET')).toMatchObject({ result: 'FALHOU', reason: 'fmt_absent' });
    for (const item of ['r2_list', 'r2_write', 'prev_daily']) {
      expect(byItem(r, item), item).toMatchObject({
        result: 'PULADO',
        reason: 'skipped_dependency',
      });
    }
    expect(byItem(r, 'sb_db')!.result).toBe('OK');
    expect(r.output).toContain('R2_BUCKET ausente.');
    expect(r.calls.filter((call) => /^(list|put|delete|get)/.test(call))).toEqual([]);
  });

  it('segredo só com espaços é "vazio" e pula o ciclo do gpg', () => {
    const r = run('backup', { BACKUP_PASSPHRASE: '   ' });
    expect(byItem(r, 'fmt.BACKUP_PASSPHRASE')).toMatchObject({
      result: 'FALHOU',
      reason: 'fmt_empty',
    });
    expect(byItem(r, 'gpg_cycle')).toMatchObject({
      result: 'PULADO',
      reason: 'skipped_dependency',
    });
    expect(byItem(r, 'prev_daily')).toMatchObject({ result: 'PULADO' });
  });

  it('formato inesperado e erro funcional aparecem juntos (todos os problemas de uma vez)', () => {
    const r = run('backup', { R2_ACCESS_KEY_ID: 'abc' });
    expect(byItem(r, 'fmt.R2_ACCESS_KEY_ID')).toMatchObject({ reason: 'fmt_format' });
    expect(byItem(r, 'r2_list')).toMatchObject({ result: 'FALHOU', reason: 'r2_key_invalid' });
    expect(r.output).toContain('Formato esperado: 32 caracteres hexadecimais minúsculos');
    expectNoLeak(r.output);
  });

  it('o token do Supabase fora do formato falha o formato e a CLI o recusa', () => {
    const bad = `sbp_${'0123456789abcdef'.repeat(2)}0123456`; // 39 caracteres hexadecimais
    const r = run('backup', { SUPABASE_ACCESS_TOKEN: bad, FAKE_SB_TOKEN: 'invalid' });
    expect(byItem(r, 'fmt.SUPABASE_ACCESS_TOKEN')).toMatchObject({ reason: 'fmt_format' });
    expect(byItem(r, 'sb_token')).toMatchObject({ result: 'FALHOU' });
    expectNoLeak(r.output, [bad]);
  });
});

describe('preflight.sh: erro não classificado', () => {
  it('mostra o passo, o código de saída e o identificador permitido, e mais nada', () => {
    const r = run('backup', { FAKE_AWS_LIST: 'unknown' });
    expect(r.status).toBe(1);
    expect(byItem(r, 'r2_list')).toEqual({
      item: 'r2_list',
      result: 'FALHOU',
      reason: 'unclassified',
      step: 'r2_list',
      code: 254,
      ident: 'SomethingNew',
    });
    expect(r.output).toContain(
      'Erro não classificado no passo R2: listar o bucket (código de saída 254). Identificador do erro: SomethingNew.',
    );
    expectNoLeak(r.output);
    expectNoLeak(r.summary());
  });

  it('identificador do JSON da CLI do Supabase (campo code)', () => {
    const r = run('backup', { FAKE_SB_DB: 'unknown' });
    expect(byItem(r, 'sb_db')).toMatchObject({
      reason: 'unclassified',
      ident: 'NovoErroDaCli',
      code: 1,
    });
    expect(r.output).toContain(
      'Erro não classificado no passo Supabase: senha e conexão do banco (código de saída 1). Identificador do erro: NovoErroDaCli.',
    );
    expectNoLeak(r.output);
  });

  it('texto sem nenhuma posição estrutural: só o passo e o código', () => {
    const r = run('backup', { FAKE_AWS_LIST: 'weird' });
    expect(byItem(r, 'r2_list')).toEqual({
      item: 'r2_list',
      result: 'FALHOU',
      reason: 'unclassified',
      step: 'r2_list',
      code: 1,
    });
    expect(r.output).toContain(
      'Erro não classificado no passo R2: listar o bucket (código de saída 1).',
    );
    expect(r.output).not.toContain('Identificador do erro');
    expectNoLeak(r.output);
    expectNoLeak(r.summary());
  });

  it('falha inesperada da própria pré-verificação: passo e código, o job falha, o resumo existe', () => {
    const r = run('backup', { PATH: `${crashBin}:${harnessPaths().bin}:${process.env.PATH}` });
    expect(r.status).toBe(7);
    expect(r.records).toContainEqual({
      item: 'internal',
      result: 'FALHOU',
      reason: 'unclassified',
      step: 'format',
      code: 7,
    });
    const summary = r.summary();
    expect(summary).toContain(
      'Erro não classificado no passo verificação de formato dos segredos (código de saída 7)',
    );
    expect(summary).toContain('Esta verificação não chegou a rodar');
    expectNoLeak(summary);
    expectNoLeftovers(r);
  });
});

describe('preflight.sh: um PULADO nunca esconde um FALHOU', () => {
  it('o passo termina com erro se houver qualquer FALHOU, mesmo havendo itens pulados', () => {
    for (const overrides of [
      { FAKE_SB_TOKEN: 'invalid' },
      { FAKE_AWS_LIST: 'no_bucket' },
      { R2_BUCKET: undefined },
    ] as Overrides[]) {
      const r = run('backup', overrides);
      expect(r.records.some((record) => record.result === 'PULADO')).toBe(true);
      expect(r.records.some((record) => record.result === 'FALHOU')).toBe(true);
      expect(r.status).toBe(1);
      expect(r.summary()).toContain('**Resultado: FALHOU**');
    }
  });

  it('o resumo nunca existe sem tabela quando o arquivo de resultados falta', () => {
    const dir = join(harnessPaths().tmp, 'sem-resultados');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'summary.md');
    const cwd = join(dir, 'cwd');
    mkdirSync(cwd);
    symlinkSync(join(ROOT, 'scripts'), join(cwd, 'scripts'));
    symlinkSync(join(ROOT, '.github'), join(cwd, '.github'));
    const result = spawnSync('bash', ['scripts/backup/preflight-summary.sh', 'backup'], {
      cwd,
      env: procEnv({ PATH: process.env.PATH ?? '', RUNNER_TEMP: dir, GITHUB_STEP_SUMMARY: file }),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const summary = readFileSync(file, 'utf8');
    expect(summary).toContain('**Resultado: FALHOU.** A pré-verificação não chegou a terminar');
  });
});

describe('preflight.sh: Environment restore é só leitura', () => {
  const restoreOverrides: Overrides = {
    // O Environment restore não tem os segredos de produção do Supabase.
    SUPABASE_DB_PASSWORD: undefined,
    SUPABASE_PROJECT_REF: undefined,
  };

  it('nunca grava, apaga nem copia no bucket (nem com o destino configurado)', () => {
    const r = run('check-restore', {
      ...restoreOverrides,
      FAKE_DAILY_JSON: fixtures.dailyJson,
      FAKE_WEEKLY_JSON: fixtures.weeklyJson,
    });
    expect(r.status).toBe(0);
    expect(r.calls.filter((call) => /^(put-object|delete-object|copy-object)/.test(call))).toEqual(
      [],
    );
    expect(r.records.map((record) => record.item)).toEqual(SCOPES['check-restore']!.items);
    expect(r.records.some((record) => record.item === 'r2_write')).toBe(false);
    // Lê os dois backups mais recentes e valida o destino pelo mesmo caminho do db-restore (link + psql).
    expect(r.calls).toContain(`get-object ${DAILY_KEY}`);
    expect(r.calls).toContain(`get-object ${WEEKLY_KEY}`);
    expect(r.calls).toContain('psql');
    expect(r.calls.some((call) => call.startsWith('supabase db dump'))).toBe(false);
    expectNoLeak(r.output);
  });

  it('o resumo diz que é o Environment restore e a falha do destino cita o segredo certo', () => {
    const r = run('check-restore', { ...restoreOverrides, FAKE_PSQL: 'password' });
    expect(r.status).toBe(1);
    expect(byItem(r, 'sb_db')).toEqual({
      item: 'sb_db',
      result: 'FALHOU',
      reason: 'sb_db_password',
    });
    const summary = r.summary();
    expect(summary).toContain('Environment restore');
    expect(summary).toContain("Environment 'restore'");
    expect(summary).toContain('RESTORE_TARGET_DB_PASSWORD');
    expectNoLeak(r.output);
    expectNoLeak(summary);
    expect(r.calls.some((call) => /^(put-object|delete-object|copy-object)/.test(call))).toBe(
      false,
    );
  });

  it('destino ainda não criado (RESTORE_TARGET_* ausentes): PULADO normal, sem tocar no Supabase', () => {
    const r = run('check-restore', {
      ...restoreOverrides,
      RESTORE_TARGET_PROJECT_REF: undefined,
      RESTORE_TARGET_DB_PASSWORD: undefined,
    });
    expect(r.status).toBe(0);
    for (const item of [
      'fmt.SUPABASE_ACCESS_TOKEN',
      'fmt.RESTORE_TARGET_PROJECT_REF',
      'fmt.RESTORE_TARGET_DB_PASSWORD',
      'sb_token',
      'sb_project',
      'sb_db',
    ]) {
      expect(byItem(r, item), item).toEqual({
        item,
        result: 'PULADO',
        reason: 'target_not_created',
      });
    }
    expect(r.calls.some((call) => call.startsWith('supabase') || call === 'psql')).toBe(false);
    expect(r.calls.some((call) => /^(put-object|delete-object|copy-object)/.test(call))).toBe(
      false,
    );
    expect(r.summary()).toContain('ainda não existem neste Environment');
  });

  it('só metade do destino criada: a metade que falta é FALHOU (ausente)', () => {
    const r = run('check-restore', { ...restoreOverrides, RESTORE_TARGET_DB_PASSWORD: undefined });
    expect(r.status).toBe(1);
    expect(byItem(r, 'fmt.RESTORE_TARGET_DB_PASSWORD')).toMatchObject({
      result: 'FALHOU',
      reason: 'fmt_absent',
    });
    expect(byItem(r, 'sb_db')).toMatchObject({ result: 'PULADO', reason: 'skipped_dependency' });
  });
});

describe('preflight.sh: escopos e segurança de uso', () => {
  it('recusa um escopo desconhecido e o selftest sem R2_ENDPOINT', () => {
    expect(run('nao-existe').status).toBe(2);
    expect(run('selftest').status).toBe(2);
  });

  it('o escopo selftest roda sem verificação de formato (S3 local)', () => {
    const r = run('selftest', {
      R2_ENDPOINT: 'http://127.0.0.1:19000',
      FAKE_EXPECT_ENDPOINT: 'http://127.0.0.1:19000',
      R2_ACCOUNT_ID: undefined,
    });
    expect(r.status).toBe(0);
    expect(r.records.map((record) => record.item)).toEqual(SCOPES.selftest!.items);
  });

  it('só os segredos pedidos viram ::add-mask:: e nenhuma saída traz valor derivado em outra forma', () => {
    const r = run(
      'backup',
      Object.fromEntries(BACKUP_SECRETS.map((name) => [name, ` ${SECRETS[name]} `])),
    );
    const masks = r.output.split('\n').filter((line) => line.startsWith('::add-mask::'));
    expect(masks.sort()).toEqual(
      BACKUP_SECRETS.map((name) => `::add-mask::${SECRETS[name]}`).sort(),
    );
    expect(r.records.filter((record) => record.reason === 'fmt_whitespace')).toHaveLength(8);
    expectNoLeak(r.output);
  });
});
