import { readFileSync } from 'node:fs';

/*
 * Leitor mínimo dos workflows de backup para os testes (sem biblioteca de YAML: o app não ganha dependência).
 * Entende só o formato destes arquivos: `jobs:` > `<job>:` > `steps:` com itens em `      - chave: valor`,
 * `env:` de um nível e `run:` em linha ou em bloco `|`. Qualquer forma que ele não entenda lança erro, para o
 * teste avisar em vez de passar em falso.
 */
export interface Step {
  name: string;
  id?: string;
  uses?: string;
  if?: string;
  continueOnError?: string;
  run?: string;
  env: Record<string, string>;
}

const indentOf = (line: string) => line.search(/\S/);

export function parseSteps(workflowFile: string, job: string): Step[] {
  const lines = readFileSync(`.github/workflows/${workflowFile}`, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line));
  const jobStart = lines.findIndex((line) => line === `  ${job}:`);
  if (jobStart < 0) throw new Error(`job ${job} não encontrado em ${workflowFile}`);
  const stepsStart = lines.findIndex((line, i) => i > jobStart && line === '    steps:');
  if (stepsStart < 0) throw new Error(`steps não encontrado no job ${job}`);

  const steps: Step[] = [];
  let current: Step | null = null;
  let block: 'env' | 'run' | 'with' | null = null;
  let runLines: string[] = [];
  const closeRun = () => {
    if (current && block === 'run') current.run = runLines.join('\n').trimEnd();
    runLines = [];
  };

  for (let i = stepsStart + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    const indent = indentOf(line);
    if (indent < 6) break; // outro job ou fim do arquivo
    if (indent === 6 && line.startsWith('      - ')) {
      closeRun();
      current = { name: '', env: {} };
      steps.push(current);
      block = null;
      parseKey(current, line.slice(8), (value) => (block = value));
      continue;
    }
    if (!current) throw new Error(`linha fora de um passo: ${line}`);
    if (block === 'run' && indent >= 10) {
      runLines.push(line.slice(10));
      continue;
    }
    if (block === 'env' && indent === 10) {
      const match = /^(\w+): (.*)$/.exec(line.trim());
      if (!match) throw new Error(`env não entendido: ${line}`);
      current.env[match[1]!] = unquote(match[2]!);
      continue;
    }
    if (block === 'with' && indent >= 10) continue;
    if (indent === 8) {
      closeRun();
      parseKey(current, line.slice(8), (value) => (block = value));
      continue;
    }
    throw new Error(`linha não entendida: ${line}`);
  }
  closeRun();
  return steps;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return /^'.*'$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

function parseKey(step: Step, text: string, set: (block: 'env' | 'run' | 'with' | null) => void) {
  const match = /^([\w-]+):\s?(.*)$/.exec(text);
  if (!match) throw new Error(`chave não entendida: ${text}`);
  const [, key, rawValue] = match as unknown as [string, string, string];
  const value = unquote(rawValue);
  set(null);
  switch (key) {
    case 'name':
      step.name = value;
      break;
    case 'id':
      step.id = value;
      break;
    case 'uses':
      step.uses = value.split(' ')[0]!;
      break;
    case 'if':
      step.if = value;
      break;
    case 'continue-on-error':
      step.continueOnError = value;
      break;
    case 'env':
      set('env');
      break;
    case 'with':
      set('with');
      break;
    case 'run':
      if (value === '|') set('run');
      else step.run = value;
      break;
    default:
      throw new Error(`chave de passo desconhecida: ${key}`);
  }
}

export interface Context {
  secrets: Record<string, string | undefined>;
  inputs: Record<string, string | boolean | undefined>;
  event: string;
}

const truthy = (value: string | boolean | undefined) => value === true || value === 'true';

/** Resolve os `${{ … }}` que estes workflows usam; qualquer outra forma lança erro. */
export function expand(value: string, ctx: Context): string {
  return value.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, expression: string) => {
    let match = /^secrets\.(\w+)$/.exec(expression);
    if (match) return ctx.secrets[match[1]!] ?? '';
    match = /^inputs\.(\w+)$/.exec(expression);
    if (match) return String(ctx.inputs[match[1]!] ?? '');
    match = /^github\.event_name == '(\w+)' && inputs\.(\w+) && 'true' \|\| 'false'$/.exec(
      expression,
    );
    if (match) return ctx.event === match[1] && truthy(ctx.inputs[match[2]!]) ? 'true' : 'false';
    match = /^inputs\.(\w+) == '(\w+)' && secrets\.(\w+) \|\| ''$/.exec(expression);
    if (match) {
      return ctx.inputs[match[1]!] === match[2] ? (ctx.secrets[match[3]!] ?? '') : '';
    }
    throw new Error(`expressão não suportada pelo teste: ${expression}`);
  });
}

/** Condição de um passo: sem `if` é success(); só `always()` é entendido além disso. */
export function condition(step: Step): 'success' | 'always' {
  if (step.if === undefined || step.if === 'success()') return 'success';
  if (step.if === 'always()') return 'always';
  throw new Error(`condição não suportada pelo teste: ${step.if}`);
}

export interface Simulation {
  ran: string[];
  skipped: string[];
  failed: string[];
}

/**
 * Executa os passos como o GitHub: depois de uma falha, só rodam os passos com `always()`; um passo com
 * `continue-on-error: true` não derruba os seguintes. `execute` devolve o código de saída de cada passo.
 */
export function simulate(steps: Step[], execute: (step: Step) => number): Simulation {
  const result: Simulation = { ran: [], skipped: [], failed: [] };
  let broken = false;
  for (const step of steps) {
    if (broken && condition(step) !== 'always') {
      result.skipped.push(step.name);
      continue;
    }
    result.ran.push(step.name);
    if (execute(step) !== 0) {
      result.failed.push(step.name);
      if (step.continueOnError !== 'true') broken = true;
    }
  }
  return result;
}
