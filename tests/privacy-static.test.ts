import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Regras de privacidade que se garantem lendo o código:
 *  - nenhum `console.*` fora do helper de log (que só imprime nome, construtor, status e códigos);
 *  - toda chamada do helper passa só o erro capturado, nunca `.message` nem dados da pessoa;
 *  - as rotas e ações de "Minha conta" exigem login e agem só sobre quem está logado;
 *  - as páginas de erro não mostram detalhe técnico.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const sources = walk(join(ROOT, 'src'))
  .filter((file) => /\.tsx?$/.test(file) && !isTest(file))
  .map((file) => ({ path: relative(ROOT, file), text: readFileSync(file, 'utf8') }));

describe('auditoria de logs', () => {
  it('há código para auditar', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('console.* só existe no helper de log (src/lib/auth/log.ts)', () => {
    const offenders = sources
      .filter(({ path, text }) => path !== 'src/lib/auth/log.ts' && /\bconsole\s*\./.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('o helper só imprime nomes e códigos, nunca a mensagem do erro', () => {
    const log = read('src/lib/auth/log.ts');
    expect(log).not.toMatch(/\.message\b/);
    expect(log).toMatch(/SAFE_TEXT/);
  });

  it('toda chamada de logFailure/logAuthFailure passa só uma variável de erro', () => {
    const call = /\blog(?:Auth)?Failure\(\s*(?:'[^']*'|`[^`]*`)\s*,\s*([^)]*)\)/g;
    const bad: string[] = [];
    let total = 0;
    for (const { path, text } of sources) {
      for (const match of text.matchAll(call)) {
        total += 1;
        const arg = match[1]!.trim();
        // O erro capturado ou um objeto de erro novo, e mais nada (nada de `error.message`, dados ou texto).
        if (!/^[A-Za-z_$][\w$]*$/.test(arg)) bad.push(`${path}: ${match[0]}`);
      }
    }
    expect(total).toBeGreaterThan(30);
    expect(bad).toEqual([]);
  });

  it('nenhum catch usa error.message para outra coisa além de classificar o erro', () => {
    const offenders = sources
      // `/padrão/.test(error.message)` só decide o tipo do erro; o texto nunca sai dali.
      .map(({ path, text }) => ({ path, text: text.replace(/\.test\(\s*\w+\.message\s*\)/g, '') }))
      .filter(({ text }) => /catch\s*\(\s*(\w+)\s*\)\s*\{[^}]*\1\.message/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});

describe('Minha conta', () => {
  it('a página exige login e não pode ser indexada', () => {
    const page = read('src/app/(public)/conta/page.tsx');
    expect(page).toMatch(/await requireUser\(\)/);
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it('cada Server Action exige login antes de agir e não recebe id de pessoa', () => {
    const source = read('src/app/(public)/conta/actions.ts');
    const bodies = source.split(/export async function /).slice(1);
    expect(bodies.length).toBe(2);
    for (const body of bodies) {
      expect(body).toMatch(/await require(User|UserId)\(\)/);
      // Antes de qualquer acesso ao banco.
      expect(body.indexOf('requireUser')).toBeLessThan(body.indexOf('createClient'));
      expect(body).not.toMatch(/formData\.get\('(userId|id|authorId)'\)/);
    }
  });

  it('retractComment exige login antes de tocar no banco', () => {
    const source = read('src/app/(public)/comment-actions.ts');
    const retract = source.slice(source.indexOf('export async function retractComment'));
    expect(retract.indexOf('await requireUser()')).toBeGreaterThan(-1);
    expect(retract.indexOf('await requireUser()')).toBeLessThan(retract.indexOf('createClient'));
    expect(retract).toMatch(/rpc\('retract_comment'/);
  });

  it('a exportação confere a identidade no Auth e filtra TODA consulta pelo id da pessoa', () => {
    const route = read('src/app/(public)/conta/dados/route.ts');
    expect(route).toMatch(/auth\.getUser\(\)/);
    expect(route).toMatch(/is_anonymous/);
    expect(route).toMatch(/\.eq\('id', user\.id\)/);
    expect(route).toMatch(/\.eq\('author_id', user\.id\)/);
    expect(route).toMatch(/\.eq\('user_id', user\.id\)/);
    expect(route).toMatch(/'Cache-Control': 'no-store'/);
    expect(route).toMatch(/attachment; filename=/);
    // Nenhum parâmetro da requisição entra na consulta.
    expect(route).not.toMatch(/searchParams|request\.url|\(request/);
  });

  it('a exclusão da conta usa a função do banco, sem argumentos, e nunca a chave de serviço', () => {
    const actions = read('src/app/(public)/conta/actions.ts');
    expect(actions).toMatch(/rpc\('delete_my_account'\)/);
    expect(actions).not.toMatch(/admin\.deleteUser|service_role|SERVICE_ROLE/);
  });
});

describe('páginas de erro', () => {
  const files = [
    'src/app/global-error.tsx',
    'src/app/(public)/error.tsx',
    'src/app/painel/error.tsx',
  ];

  it.each(files)('%s não mostra detalhe técnico', (file) => {
    const text = read(file);
    expect(text).toMatch(/'use client'/);
    expect(text).not.toMatch(/error\.(message|stack|digest)|\bdigest\b|\.stack\b/);
    expect(text).toMatch(/Algo deu errado por aqui/);
  });

  it('o global-error troca o <html> e fala português', () => {
    const text = read('src/app/global-error.tsx');
    expect(text).toMatch(/<html lang="pt-BR">/);
    expect(text).toMatch(/<body>/);
  });
});
