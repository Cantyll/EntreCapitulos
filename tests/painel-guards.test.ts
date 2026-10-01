import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Toda página, layout e Server Action do painel precisa conferir o papel no servidor. O proxy só
 * redireciona por conveniência. Este teste falha se um arquivo novo esquecer o `requireRole`.
 */
const PAINEL = join(process.cwd(), 'src/app/painel');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(PAINEL).filter((f) => /\.tsx?$/.test(f));
const guarded = files.filter((f) => {
  const source = readFileSync(f, 'utf8');
  return (
    /(^|\/)(page|layout)\.tsx$/.test(f) ||
    /(^|\/)route\.tsx?$/.test(f) ||
    /^['"]use server['"]/m.test(source)
  );
});

describe('painel', () => {
  it('encontra páginas para conferir', () => {
    expect(guarded.length).toBeGreaterThan(5);
  });

  it.each(guarded.map((f) => [f.slice(PAINEL.length)]))('%s chama requireRole', (file) => {
    const source = readFileSync(join(PAINEL, file as string), 'utf8');
    expect(source).toMatch(/requireRole\(\s*'(admin|staff)'\s*\)/);
  });

  // Em arquivo de Server Actions, CADA action chama `requireRole` (um só no arquivo não basta).
  const actionFiles = files.filter((f) => /^['"]use server['"]/m.test(readFileSync(f, 'utf8')));

  it('encontra arquivos de Server Actions', () => {
    expect(actionFiles.length).toBeGreaterThan(1);
  });

  it.each(actionFiles.map((f) => [f.slice(PAINEL.length)]))(
    '%s: cada action chama requireRole',
    (file) => {
      const source = readFileSync(join(PAINEL, file as string), 'utf8');
      const actions = source.match(/^export async function \w+/gm) ?? [];
      const guards = source.match(/await requireRole\(\s*'(admin|staff)'\s*\)/g) ?? [];
      expect(actions.length).toBeGreaterThan(0);
      expect(guards.length).toBeGreaterThanOrEqual(actions.length);
    },
  );
});
