import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  SECRETS,
  expectNoLeak,
  fixtures,
  installHarness,
  prepare,
  procEnv,
  type Overrides,
} from './preflight-harness';
import { expand, parseSteps, simulate, type Context } from './workflow-steps';

/*
 * Simula, passo a passo, o job de cada workflow com as REGRAS DO GITHUB (depois de uma falha só rodam os passos
 * com `always()`), usando o YAML de verdade e os scripts de verdade da pré-verificação. Os passos que precisam
 * de rede, Docker ou do Supabase (dump, envio, restauração, ações) não rodam aqui: o teste só registra se o
 * GitHub os executaria. Isto prova que, se a pré-verificação falhar, nenhum dump é gerado nem enviado, e que o
 * resumo e a limpeza existem mesmo assim.
 */
installHarness();
vi.setConfig({ testTimeout: 60_000 });

const PREFLIGHT = 'Pré-verificação das credenciais';
const SUMMARY = ['Resumo da pré-verificação', 'Resumo da verificação'];
const CLEANUP = 'Apagar os temporários';

interface Setup {
  file: string;
  job: string;
  scope: string;
  /** Passos que gerariam ou enviariam backup, ou restauram: nunca podem rodar se a pré-verificação falhar. */
  guarded: string[];
}
const WORKFLOWS: Setup[] = [
  {
    file: 'backup.yml',
    job: 'backup',
    scope: 'backup',
    guarded: ['Gerar e criptografar o backup', 'Enviar ao R2 e conferir'],
  },
  {
    file: 'backup-drill.yml',
    job: 'drill',
    scope: 'drill',
    guarded: [
      'Conferir a idade dos backups',
      'Start local Supabase',
      'Baixar, descriptografar e restaurar',
    ],
  },
];

interface Options {
  inputs?: Context['inputs'];
  event?: string;
  overrides?: Overrides;
  secrets?: Context['secrets'];
  failingStubs?: string[];
}

function runWorkflow(file: string, job: string, options: Options = {}) {
  const { inputs = {}, event = 'schedule', overrides = {}, failingStubs = [] } = options;
  const steps = parseSteps(file, job);
  const { dir, cwd, env, log } = prepare({ ...overrides, GITHUB_EVENT_NAME: event });
  const summaryFile = join(dir, 'summary.md');
  writeFileSync(summaryFile, '');
  const ctx: Context = { secrets: options.secrets ?? { ...SECRETS }, inputs, event };
  // Um passo só enxerga o que o próprio `env:` dele declara (nunca os segredos do ambiente de teste).
  const clean = { ...env };
  for (const name of Object.keys(SECRETS)) delete clean[name];
  const executed: string[] = [];
  const stubbed: string[] = [];
  const outputs: string[] = [];
  const result = simulate(steps, (step) => {
    if (step.uses) return 0;
    const real = /preflight(-summary)?\.sh|wipe_dir/.test(step.run ?? '');
    if (!real) {
      stubbed.push(step.name);
      return failingStubs.includes(step.name) ? 1 : 0;
    }
    executed.push(step.name);
    const stepEnv: Record<string, string> = {
      ...clean,
      GITHUB_STEP_SUMMARY: summaryFile,
      BACKUP_WORKDIR: join(dir, 'backup'),
    };
    for (const [key, value] of Object.entries(step.env)) stepEnv[key] = expand(value, ctx);
    const out = spawnSync('bash', ['-e', '-c', step.run!], {
      cwd,
      env: procEnv(stepEnv),
      encoding: 'utf8',
    });
    outputs.push(`${out.stdout}${out.stderr}`);
    return out.status ?? 1;
  });
  return {
    ...result,
    steps,
    executed,
    stubbed,
    summary: readFileSync(summaryFile, 'utf8'),
    log: readFileSync(log, 'utf8').split('\n').filter(Boolean),
    output: outputs.join('\n'),
  };
}

describe.each(WORKFLOWS)(
  '$file: a pré-verificação manda no resto do job',
  ({ file, job, scope, guarded }) => {
    const steps = parseSteps(file, job);
    const names = steps.map((step) => step.name || step.uses || '');

    it('a pré-verificação vem antes de qualquer passo que use a CLI, o R2 ou o banco', () => {
      const index = names.indexOf(PREFLIGHT);
      expect(index).toBeGreaterThan(-1);
      for (const name of guarded) expect(names.indexOf(name), name).toBeGreaterThan(index);
      // Antes dela só entram o checkout, a instalação da CLI e a pasta temporária: nada com segredo.
      for (const step of steps.slice(0, index)) {
        expect(Object.keys(step.env), step.name || step.uses).toEqual([]);
      }
      expect(steps[index]!.run).toContain(`scripts/backup/preflight.sh ${scope}`);
    });

    it('nenhum passo tem continue-on-error e só o resumo e a limpeza rodam depois de uma falha', () => {
      for (const step of steps) {
        expect(step.continueOnError, step.name).toBeUndefined();
        const always = step.if === 'always()';
        const expected = SUMMARY.includes(step.name) || step.name === CLEANUP;
        expect(always, step.name).toBe(expected);
        if (!always) expect(step.if, step.name).toBeUndefined();
      }
      // Resumo e limpeza são os dois últimos, nessa ordem.
      expect(SUMMARY).toContain(names.at(-2));
      expect(names.at(-1)).toBe(CLEANUP);
    });

    it('o resumo lê o mesmo escopo que a pré-verificação', () => {
      const summary = steps.find((step) => SUMMARY.includes(step.name))!;
      expect(summary.run).toContain(`preflight-summary.sh ${scope}`);
    });

    it('tudo certo: todos os passos rodam, na ordem, e o resumo diz OK', () => {
      const r = runWorkflow(file, job, {
        overrides: { FAKE_DAILY_JSON: fixtures.dailyJson, FAKE_WEEKLY_JSON: fixtures.weeklyJson },
      });
      expect(r.failed).toEqual([]);
      expect(r.skipped).toEqual([]);
      expect(r.ran).toEqual(steps.map((step) => step.name));
      expect(r.summary).toContain('**Resultado: OK**');
      expectNoLeak(r.output);
      expectNoLeak(r.summary);
    });

    it.each(
      (
        [
          ['R2 inalcançável', { FAKE_AWS_LIST: 'no_bucket' }],
          ['token do Supabase inválido', { FAKE_SB_TOKEN: 'invalid' }],
          ['segredo ausente', { R2_BUCKET: undefined }],
        ] as [string, Overrides][]
      ).filter(([, overrides]) => scope !== 'drill' || !overrides.FAKE_SB_TOKEN), // o drill não usa o Supabase de produção
    )(
      'pré-verificação falha (%s): o backup NÃO continua e o resumo e a limpeza existem',
      (_name, overrides) => {
        const secrets = { ...SECRETS };
        if ('R2_BUCKET' in overrides)
          delete (secrets as Record<string, string | undefined>).R2_BUCKET;
        const r = runWorkflow(file, job, { overrides, secrets });
        expect(r.failed).toEqual([PREFLIGHT]);
        for (const name of guarded) {
          expect(r.skipped, name).toContain(name);
          expect(r.ran, name).not.toContain(name);
          expect(r.stubbed, name).not.toContain(name);
        }
        expect(r.ran).toEqual(
          expect.arrayContaining([PREFLIGHT, ...SUMMARY.filter((n) => names.includes(n)), CLEANUP]),
        );
        // Nenhum dump, nenhum envio: nem o dump de dados nem qualquer escrita em daily/ ou weekly/.
        expect(r.log.filter((call) => /--data-only/.test(call))).toEqual([]);
        expect(
          r.log.filter((call) => /^(put-object|copy-object) (daily|weekly)\//.test(call)),
        ).toEqual([]);
        expect(r.summary).toContain('**Resultado: FALHOU**');
        expect(r.summary).toContain('| Item | Resultado | Motivo | O que fazer |');
        expectNoLeak(r.output);
        expectNoLeak(r.summary);
      },
    );
  },
);

describe('backup.yml: o resumo existe mesmo se um passo posterior falhar', () => {
  it('o dump falha: o envio é pulado, o resumo (com a tabela) e a limpeza rodam', () => {
    const r = runWorkflow('backup.yml', 'backup', {
      failingStubs: ['Gerar e criptografar o backup'],
    });
    expect(r.failed).toEqual(['Gerar e criptografar o backup']);
    expect(r.skipped).toEqual(['Enviar ao R2 e conferir']);
    expect(r.ran).toContain('Resumo da pré-verificação');
    expect(r.ran.at(-1)).toBe(CLEANUP);
    expect(r.summary).toContain('| Item | Resultado | Motivo | O que fazer |');
    expect(r.summary).toContain('**Resultado: OK**');
  });

  it('o envio falha: o resumo ainda existe', () => {
    const r = runWorkflow('backup.yml', 'backup', { failingStubs: ['Enviar ao R2 e conferir'] });
    expect(r.failed).toEqual(['Enviar ao R2 e conferir']);
    expect(r.ran).toContain('Resumo da pré-verificação');
    expect(r.summary).toContain('Pré-verificação das credenciais: Backup do banco');
  });
});

describe('backup.yml: passphrase_rotated', () => {
  const rotated = (event: string, flag: boolean) =>
    runWorkflow('backup.yml', 'backup', {
      event,
      inputs: { passphrase_rotated: flag },
      overrides: { FAKE_DAILY_JSON: fixtures.dailyJson, FAKE_DAILY_GPG: fixtures.dailyOther },
    });

  it('em disparo manual com a opção ligada: pula a comparação de propósito, avisa e o backup segue', () => {
    const r = rotated('workflow_dispatch', true);
    expect(r.failed).toEqual([]);
    expect(r.ran).toContain('Gerar e criptografar o backup');
    expect(r.summary).toContain('pulada de propósito');
    expect(r.summary).toContain('force_weekly');
    expect(r.summary).toContain('backup diário mais recente passar a abrir com a frase nova');
  });

  it('desligada, ou fora do disparo manual: a comparação roda e uma frase diferente derruba o job', () => {
    for (const [event, flag] of [
      ['workflow_dispatch', false],
      ['schedule', true],
    ] as const) {
      const r = rotated(event, flag);
      expect(r.failed, `${event}/${flag}`).toEqual([PREFLIGHT]);
      expect(r.skipped).toContain('Gerar e criptografar o backup');
      expect(r.summary).toContain('NÃO abre os backups anteriores');
    }
  });
});

describe('credentials-check.yml: não gera nem envia backup', () => {
  const steps = parseSteps('credentials-check.yml', 'check');

  it('a verificação vem antes do resumo e da limpeza, que rodam sempre; nada tem continue-on-error', () => {
    const names = steps.map((step) => step.name || step.uses || '');
    expect(names.indexOf('Verificar as credenciais')).toBeGreaterThan(-1);
    expect(names.slice(-2)).toEqual(['Resumo da verificação', CLEANUP]);
    for (const step of steps) {
      expect(step.continueOnError, step.name).toBeUndefined();
      expect(step.if === 'always()', step.name).toBe(
        ['Resumo da verificação', CLEANUP].includes(step.name),
      );
    }
  });

  it('só verifica: nenhum passo executa o dump, o envio, a prova ou a restauração', () => {
    const scripts = steps.map((step) => step.run ?? '').join('\n');
    for (const forbidden of [
      'make-backup',
      'upload.sh',
      'drill.sh',
      'restore-remote',
      'restore-data',
      'open-backup',
    ]) {
      expect(scripts).not.toContain(forbidden);
    }
  });

  it('Environment backup: roda no escopo check-backup e escreve só em _preflight/', () => {
    const r = runWorkflow('credentials-check.yml', 'check', {
      event: 'workflow_dispatch',
      inputs: { environment: 'backup' },
      overrides: { FAKE_DAILY_JSON: fixtures.dailyJson, FAKE_WEEKLY_JSON: fixtures.weeklyJson },
    });
    expect(r.failed).toEqual([]);
    expect(r.summary).toContain('Verificação das credenciais (Environment backup)');
    const writes = r.log.filter((call) => /^(put-object|delete-object|copy-object) /.test(call));
    expect(writes).toEqual([
      'put-object _preflight/12345-1.txt',
      'delete-object _preflight/12345-1.txt',
    ]);
  });

  it('Environment restore: só leitura no R2, mesmo com um segredo de produção no repositório', () => {
    const r = runWorkflow('credentials-check.yml', 'check', {
      event: 'workflow_dispatch',
      inputs: { environment: 'restore' },
      // SUPABASE_DB_PASSWORD e SUPABASE_PROJECT_REF existem no repositório (usados pelo Database deploy),
      // mas não podem chegar ao script no Environment restore.
      overrides: { FAKE_DAILY_JSON: fixtures.dailyJson, FAKE_WEEKLY_JSON: fixtures.weeklyJson },
    });
    expect(r.failed).toEqual([]);
    expect(r.summary).toContain('Verificação das credenciais (Environment restore)');
    expect(r.log.filter((call) => /^(put-object|delete-object|copy-object)/.test(call))).toEqual(
      [],
    );
    expect(r.log.some((call) => call.startsWith('supabase db dump'))).toBe(false);
    expect(r.log).toContain('psql');
  });

  it('os segredos de produção só chegam ao script no Environment backup, e os do destino só no restore', () => {
    const preflight = steps.find((step) => step.name === 'Verificar as credenciais')!;
    const production = ['SUPABASE_DB_PASSWORD', 'SUPABASE_PROJECT_REF'];
    const target = ['RESTORE_TARGET_PROJECT_REF', 'RESTORE_TARGET_DB_PASSWORD'];
    const secrets = Object.fromEntries(
      [...production, ...target].map((name) => [name, `valor-de-${name}`]),
    );
    const seen = (environment: string) =>
      Object.fromEntries(
        [...production, ...target].map((name) => [
          name,
          expand(preflight.env[name]!, {
            secrets,
            inputs: { environment },
            event: 'workflow_dispatch',
          }),
        ]),
      );
    expect(seen('backup')).toEqual({
      SUPABASE_DB_PASSWORD: 'valor-de-SUPABASE_DB_PASSWORD',
      SUPABASE_PROJECT_REF: 'valor-de-SUPABASE_PROJECT_REF',
      RESTORE_TARGET_PROJECT_REF: '',
      RESTORE_TARGET_DB_PASSWORD: '',
    });
    expect(seen('restore')).toEqual({
      SUPABASE_DB_PASSWORD: '',
      SUPABASE_PROJECT_REF: '',
      RESTORE_TARGET_PROJECT_REF: 'valor-de-RESTORE_TARGET_PROJECT_REF',
      RESTORE_TARGET_DB_PASSWORD: 'valor-de-RESTORE_TARGET_DB_PASSWORD',
    });
  });

  it('o escopo vem do Environment escolhido, no passo e no resumo', () => {
    for (const step of steps.filter((s) => /preflight(-summary)?\.sh/.test(s.run ?? ''))) {
      expect(
        expand(step.env.PREFLIGHT_SCOPE!, {
          secrets: {},
          inputs: { environment: 'restore' },
          event: 'workflow_dispatch',
        }),
      ).toBe('check-restore');
      expect(
        expand(step.env.PREFLIGHT_SCOPE!, {
          secrets: {},
          inputs: { environment: 'backup' },
          event: 'workflow_dispatch',
        }),
      ).toBe('check-backup');
    }
  });
});
