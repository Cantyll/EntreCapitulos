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

  // Comentários é a única área da moderadora (`staff`: administradora e moderadora); o resto do painel é
  // só da administradora. Duas exceções, ambas `staff` de propósito: o layout (a moderadora precisa
  // dele para abrir Comentários) e `/painel`, que manda a moderadora para Comentários.
  const STAFF_PATHS = (file: string) =>
    file.endsWith('/layout.tsx') && file.split('/').length === 2
      ? true
      : file === '/page.tsx' || file.startsWith('/comentarios/');

  it.each(guarded.map((f) => [f.slice(PAINEL.length)]))('%s exige o papel certo', (file) => {
    const source = readFileSync(join(PAINEL, file as string), 'utf8');
    const roles = [...source.matchAll(/requireRole\(\s*'(admin|staff)'\s*\)/g)].map((m) => m[1]);
    const expected = STAFF_PATHS(file as string) ? 'staff' : 'admin';
    expect(new Set(roles)).toEqual(new Set([expected]));
  });

  it('a moderadora só abre Comentários: nenhuma outra página aceita `staff`', () => {
    const staffFiles = guarded
      .map((f) => f.slice(PAINEL.length))
      .filter((f) => readFileSync(join(PAINEL, f), 'utf8').includes("requireRole('staff')"));
    expect(staffFiles.sort()).toEqual(
      ['/comentarios/actions.ts', '/comentarios/page.tsx', '/layout.tsx', '/page.tsx'].sort(),
    );
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

  // O que muda livro ou sessão precisa expirar o cache de dados públicos (`updateTag`), senão a home
  // e as páginas de sessão continuam mostrando o dado velho até o prazo de segurança de 5 minutos.
  // Exceções (cada uma com o motivo): ações da gestão de membros que não mudam nada público. A busca só
  // redireciona; "Mostrar e-mail" só lê; suspender comentários só afeta o composer de quem foi suspenso e o painel.
  // As outras ações de membros (cargo, exclusão) mudam o selo e os comentários públicos e expiram o cache.
  const NO_PUBLIC_CACHE = new Set<string>([
    'searchMembers',
    'showMemberContact',
    'setMemberSuspension',
  ]);

  it.each(actionFiles.map((f) => [f.slice(PAINEL.length)]))(
    '%s: cada action que muda dados expira o cache público',
    (file) => {
      const source = readFileSync(join(PAINEL, file as string), 'utf8');
      const parts = source.split(/^export async function /m).slice(1);
      for (const part of parts) {
        const name = part.slice(0, part.indexOf('('));
        if (NO_PUBLIC_CACHE.has(name)) continue;
        expect(part, `${name} precisa chamar invalidate… ou updateTag`).toMatch(
          /invalidate(Books|Session|Comments)\(|refreshAfterBookChange\(|refreshPublic\(|moderate\(|refresh\(|updateTag\(/,
        );
      }
    },
  );
});
