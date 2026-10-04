import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseSteps } from './workflow-steps';

/*
 * Regras de segurança dos três workflows de backup (etapa 8d). O repositório é PÚBLICO: um workflow
 * que vaze o dump, a frase-senha ou os segredos expõe os dados de todo mundo. Estes testes são texto
 * puro sobre os arquivos (sem rede, sem segredo).
 */
const WORKFLOWS = {
  'backup.yml': 'backup',
  'backup-drill.yml': 'backup',
  'db-restore.yml': 'restore',
  // O Environment é uma escolha fechada (backup ou restore); ver o describe do credentials-check.yml.
  'credentials-check.yml': '${{ inputs.environment }}',
} as const;
const names = Object.keys(WORKFLOWS) as (keyof typeof WORKFLOWS)[];
const text = (name: string) => readFileSync(`.github/workflows/${name}`, 'utf8');
const scripts = readdirSync('scripts/backup').filter((file) => file.endsWith('.sh'));

/** Linhas de código (sem comentários de YAML/shell): comentários podem citar o que é proibido. */
function code(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

describe.each(names)('workflow %s', (name) => {
  const source = text(name);
  const body = code(source);

  it('nunca é acionado por pull_request nem pull_request_target', () => {
    expect(body).not.toMatch(/pull_request/);
    expect(body).not.toMatch(/^\s*(push|workflow_run|issue_comment|repository_dispatch):/m);
  });

  it('só dispara por schedule e/ou workflow_dispatch', () => {
    const on = /^on:\n((?:[ ]{2,}.*\n|\n)+)/m.exec(`${body}\n`)?.[1] ?? '';
    const triggers = [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
    expect(triggers.length).toBeGreaterThan(0);
    for (const trigger of triggers) expect(['schedule', 'workflow_dispatch']).toContain(trigger);
  });

  it('permissions: contents: read e nada mais', () => {
    expect(body).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(body).not.toMatch(/(write|id-token)/);
  });

  it('tem concurrency, timeout e a guarda de repositório e de main em todo job', () => {
    expect(body).toMatch(/^concurrency:/m);
    const jobs = body.split(/^jobs:\n/m)[1] ?? '';
    const jobBlocks = jobs.split(/^ {2}(?=[a-z][a-z-]*:\n)/m).filter(Boolean);
    expect(jobBlocks.length).toBeGreaterThan(0);
    for (const block of jobBlocks) {
      expect(block).toMatch(
        /if: github\.repository == 'Cantyll\/EntreCapitulos' && github\.ref == 'refs\/heads\/main'/,
      );
      expect(block).toMatch(/timeout-minutes: \d+/);
    }
  });

  it('declara o Environment certo no job que usa segredos', () => {
    const environment = WORKFLOWS[name].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(body).toMatch(new RegExp(`^ {4}environment: ${environment}$`, 'm'));
  });

  it('não gera artefato nem cache e não liga o modo de depuração do shell', () => {
    expect(body).not.toMatch(/upload-artifact|download-artifact|actions\/cache|cache:/);
    expect(body).not.toMatch(/set -[a-z]*x|xtrace|ACTIONS_STEP_DEBUG|ACTIONS_RUNNER_DEBUG/);
  });

  it('toda ação de terceiros está fixada por SHA de 40 caracteres com a versão no comentário', () => {
    const uses = [...body.matchAll(/^\s*- uses: (\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThan(0);
    for (const [, ref, rest] of uses) {
      expect(ref).toMatch(/@[0-9a-f]{40}$/);
      expect(rest).toMatch(/# v\d+\.\d+\.\d+/);
    }
  });

  it('segredos só entram por env: de um passo ou job (nunca no nível do workflow, em run ou with)', () => {
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (!/\bsecrets\./.test(line) || /^\s*#/.test(line)) return;
      // Procura para cima o bloco que contém a linha: precisa ser um `env:` aninhado em um job.
      const indent = line.search(/\S/);
      let owner = '';
      for (let i = index - 1; i >= 0; i -= 1) {
        const candidate = lines[i]!;
        if (candidate.trim() === '' || candidate.search(/\S/) >= indent) continue;
        owner = candidate;
        break;
      }
      expect(owner.trim(), `linha ${index + 1}: ${line.trim()}`).toBe('env:');
      expect(
        owner.search(/\S/),
        `linha ${index + 1}: env no nível do workflow`,
      ).toBeGreaterThanOrEqual(4);
    });
    // Nunca dentro de um `run:` nem de uma expressão de shell.
    expect(body).not.toMatch(/run: .*\$\{\{ *secrets\./);
  });

  it('nenhum eco de segredo nem de variável de segredo', () => {
    expect(body).not.toMatch(/echo .*(PASSPHRASE|SECRET|PASSWORD|TOKEN|ACCESS_KEY)/i);
    expect(body).not.toMatch(/(printenv|\benv\b *\||\bset *\|)/);
  });

  it('só mexe nos arquivos de scripts/backup/ e não imprime o ambiente', () => {
    for (const [, script] of body.matchAll(/bash (scripts\/[\w./-]+)/g)) {
      expect(existsSync(script!)).toBe(true);
      expect(script).toMatch(/^scripts\/backup\//);
    }
  });
});

describe('db-restore.yml: salvaguardas', () => {
  const body = code(text('db-restore.yml'));

  it('só workflow_dispatch', () => {
    expect(body).not.toMatch(/schedule:/);
  });

  it('a confirmação RESTAURAR é conferida num job SEM Environment e SEM segredos, antes do restore', () => {
    const validate = /^ {2}validate:\n([\s\S]*?)^ {2}restore:/m.exec(body)?.[1] ?? '';
    expect(validate).toContain('RESTAURAR');
    expect(validate).not.toMatch(/environment:/);
    expect(validate).not.toMatch(/secrets\./);
    expect(body).toMatch(/^ {4}needs: validate$/m);
  });

  it('o job de restauração usa o Environment restore e a variável PRODUCTION_PROJECT_REF', () => {
    expect(body).toMatch(/^ {4}environment: restore$/m);
    expect(body).toContain('vars.PRODUCTION_PROJECT_REF');
  });

  it('nenhum segredo de produção do Supabase além do token (que o link exige)', () => {
    expect(body).not.toMatch(/secrets\.SUPABASE_DB_PASSWORD|secrets\.SUPABASE_PROJECT_REF/);
  });
});

describe('os scripts de backup', () => {
  it.each(scripts)(
    '%s não liga xtrace, não imprime segredo e usa $RUNNER_TEMP/BACKUP_WORKDIR',
    (script) => {
      const body = code(readFileSync(`scripts/backup/${script}`, 'utf8'));
      expect(body).not.toMatch(/set -[a-z]*x|xtrace|bash -x/);
      expect(body).not.toMatch(
        /echo[^\n]*\$\{?(BACKUP_PASSPHRASE|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|R2_ACCOUNT_ID|SUPABASE_DB_PASSWORD|SUPABASE_ACCESS_TOKEN|RESTORE_TARGET_DB_PASSWORD|PGPASSWORD)/,
      );
      expect(body).not.toMatch(/--passphrase[ =]/); // a frase vai por --passphrase-fd, nunca por argumento
      expect(body).not.toMatch(/\/tmp\//);
    },
  );

  it('a frase-senha só chega ao gpg pela entrada padrão', () => {
    for (const script of ['make-backup.sh', 'open-backup.sh']) {
      const body = code(readFileSync(`scripts/backup/${script}`, 'utf8'));
      expect(body).toMatch(/printf %s "\$BACKUP_PASSPHRASE" \| gpg .*--passphrase-fd 0/s);
    }
  });
});

describe('arquivos de backup nunca no git', () => {
  const tracked = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter(Boolean);

  it('nenhum *.dump, *.gpg, *.age, *.tar.gpg nem arquivo em /backups/', () => {
    const bad = tracked.filter(
      (file) => /\.(dump|gpg|age)$/.test(file) || file.startsWith('backups/'),
    );
    expect(bad).toEqual([]);
  });

  it('o .gitignore cobre esses padrões e não ignora as migrations .sql', () => {
    const ignore = readFileSync('.gitignore', 'utf8').split('\n');
    for (const pattern of ['*.dump', '*.gpg', '*.age', '/backups/'])
      expect(ignore).toContain(pattern);
    expect(ignore).not.toContain('*.sql');
    const ignored = execFileSync(
      'git',
      ['check-ignore', '--no-index', '-v', 'a.dump', 'b.gpg', 'c.age', 'backups/x'],
      {
        encoding: 'utf8',
      },
    );
    expect(ignored.split('\n').filter(Boolean)).toHaveLength(4);
    expect(() =>
      execFileSync('git', [
        'check-ignore',
        '--no-index',
        'supabase/migrations/20260930184031_initial_schema.sql',
      ]),
    ).toThrow();
  });
});

describe('sem o modo verbose: nenhuma saída de ferramenta vai para o log', () => {
  const files = [
    ...names.map((name) => `.github/workflows/${name}`),
    ...scripts.map((script) => `scripts/backup/${script}`),
    'scripts/backup/cli.mjs',
    'scripts/backup/lib.mjs',
  ];

  it.each(files)('%s não tem verbose, show_log nem scrub', (file) => {
    const body = code(readFileSync(file, 'utf8'));
    expect(body).not.toMatch(/verbose|show_log|scrubLog|'scrub'/i);
  });

  it('os workflows não declaram nenhuma entrada de saída detalhada', () => {
    for (const name of names) expect(text(name)).not.toMatch(/^ {6}verbose:/m);
  });
});

describe('segredos e entradas nunca dentro de um run:', () => {
  const jobs: [string, string][] = [
    ['backup.yml', 'backup'],
    ['backup-drill.yml', 'drill'],
    ['db-restore.yml', 'validate'],
    ['db-restore.yml', 'restore'],
    ['credentials-check.yml', 'check'],
  ];
  it.each(jobs)('%s (job %s): nenhum "${{ … }}" em run:', (file, job) => {
    for (const step of parseSteps(file, job)) {
      expect(step.run ?? '', `${file}/${step.name}`).not.toContain('${{');
    }
  });
});

describe('credentials-check.yml', () => {
  const source = text('credentials-check.yml');
  const body = code(source);

  it('só workflow_dispatch', () => {
    const on = /^on:\n((?:[ ]{2,}.*\n|\n)+)/m.exec(`${body}\n`)?.[1] ?? '';
    expect([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1])).toEqual(['workflow_dispatch']);
  });

  it('a entrada "environment" é uma escolha fechada: choice, só backup e restore, padrão backup', () => {
    const inputs = /^ {4}inputs:\n((?: {6,}.*\n)+)/m.exec(body)?.[1] ?? '';
    const environment = /^ {6}environment:\n((?: {8,}.*\n)+)/m.exec(inputs)?.[1] ?? '';
    expect(environment).toMatch(/^ {8}type: choice$/m);
    expect(environment).toMatch(/^ {8}options:\n {10}- backup\n {10}- restore\n/m);
    expect(environment).toMatch(/^ {8}default: backup$/m);
    // Nada de texto livre: nenhuma entrada do tipo string, e só duas opções.
    expect(inputs).not.toMatch(/type: string/);
    expect(environment.match(/^ {10}- /gm)).toHaveLength(2);
  });

  it('o job confere o valor antes de iniciar (o GitHub cria um Environment com qualquer nome)', () => {
    expect(body).toMatch(
      /^ {4}if: .*\(inputs\.environment == 'backup' \|\| inputs\.environment == 'restore'\)$/m,
    );
    expect(body).toMatch(/^ {4}environment: \$\{\{ inputs\.environment \}\}$/m);
  });

  it('não gera nem envia backup e não restaura: só valida', () => {
    for (const forbidden of [
      'make-backup',
      'upload.sh',
      'drill.sh',
      'restore-remote',
      'restore-data',
    ]) {
      expect(body).not.toContain(forbidden);
    }
    expect(body).toContain('scripts/backup/preflight.sh');
  });

  it('o escopo e a opção de frase trocada chegam por env', () => {
    expect(body).toMatch(/PREFLIGHT_SCOPE: check-\$\{\{ inputs\.environment \}\}/);
    expect(body).toMatch(
      /PREFLIGHT_PASSPHRASE_ROTATED: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.passphrase_rotated && 'true' \|\| 'false' \}\}/,
    );
  });
});

describe('passphrase_rotated só vale em disparo manual', () => {
  for (const name of ['backup.yml', 'credentials-check.yml']) {
    it(`${name}: a opção é um boolean e só chega ao script em workflow_dispatch`, () => {
      const body = code(text(name));
      expect(body).toMatch(
        /^ {6}passphrase_rotated:\n(?: {8}.*\n)*? {8}type: boolean\n(?: {8}.*\n)*? {8}default: false$/m,
      );
      expect(body).toContain(
        "PREFLIGHT_PASSPHRASE_ROTATED: ${{ github.event_name == 'workflow_dispatch' && inputs.passphrase_rotated && 'true' || 'false' }}",
      );
    });
  }
  it('o drill e o db-restore não têm a opção (a prova usa sempre o semanal mais recente)', () => {
    for (const name of ['backup-drill.yml', 'db-restore.yml']) {
      expect(text(name)).not.toContain('passphrase_rotated');
    }
  });
});

describe('preflight.sh e preflight-summary.sh: regras estáticas', () => {
  const preflight = code(readFileSync('scripts/backup/preflight.sh', 'utf8'));

  it('só grava, apaga e copia no R2 com a chave de _preflight/, e só dentro do item r2_write', () => {
    const writes = preflight
      .split('\n')
      .filter((line) => /put-object|delete-object|copy-object/.test(line));
    expect(writes.length).toBeGreaterThan(0);
    for (const line of writes) {
      expect(line).toMatch(/(put|delete)-object .*--key "\$key"/);
      expect(line).not.toMatch(/copy-object/);
    }
    const guard = preflight.indexOf('has_item r2_write');
    expect(guard).toBeGreaterThan(-1);
    expect(Math.min(...writes.map((line) => preflight.indexOf(line)))).toBeGreaterThan(guard);
    expect(preflight).toMatch(/PF_PREFIX="\$\(cfg '\.preflight\.prefix'\)"/);
    expect(preflight).toMatch(/key="\$\{PF_PREFIX\}/);
  });

  it('nunca imprime o valor de um segredo: só o ::add-mask:: de um valor aparado e o texto fixo', () => {
    const printing = preflight.split('\n').filter((line) => /\b(echo|printf)\b/.test(line));
    for (const line of printing) {
      if (/::add-mask::/.test(line)) continue;
      if (/printf -v /.test(line)) continue; // atribui a uma variável, não imprime
      if (/printf %s "\$V_BACKUP_PASSPHRASE" \| gpg/.test(line)) continue; // entrada padrão do gpg
      expect(line, line).not.toMatch(/\$\{?(V_|raw|trimmed|name\b)/);
      expect(line, line).not.toMatch(
        /\$\{?(R2_|SUPABASE_|BACKUP_PASSPHRASE|RESTORE_TARGET|PGPASSWORD|AWS_)/,
      );
    }
  });

  it('a frase-senha só chega ao gpg pela entrada padrão e a saída do gpg do backup anterior é descartada', () => {
    expect(preflight).not.toMatch(/--passphrase[ =]/);
    for (const match of preflight.matchAll(
      /printf %s "\$V_BACKUP_PASSPHRASE" \| gpg[^\n]*\\?\n?[^\n]*/g,
    )) {
      expect(match[0]).toContain('--passphrase-fd 0');
    }
    expect(preflight).toMatch(/--decrypt "\$PF_DIR\/prev\.gpg" >\/dev\/null 2>/);
  });

  it('todas as saídas de ferramentas vão para arquivo em PF_DIR (que fica em $RUNNER_TEMP)', () => {
    expect(preflight).toMatch(/PF_DIR="\$\{PREFLIGHT_DIR:-\$\{RUNNER_TEMP:\?/);
    expect(preflight).toMatch(/"\$@" >"\$PF_OUT" 2>&1/);
    expect(preflight).not.toMatch(/\/tmp\//);
  });

  it('o valor aparado é mascarado antes de qualquer uso', () => {
    const maskAt = preflight.indexOf('mask_value "$trimmed"');
    const firstUse = preflight.indexOf('printf -v "V_$name"');
    expect(maskAt).toBeGreaterThan(-1);
    expect(maskAt).toBeLessThan(firstUse);
  });

  it('o resumo roda sem tocar em segredos e não falha o job', () => {
    const summary = code(readFileSync('scripts/backup/preflight-summary.sh', 'utf8'));
    expect(summary).toContain('pf-summary');
    expect(summary).not.toMatch(/\bexit\b/);
  });
});
