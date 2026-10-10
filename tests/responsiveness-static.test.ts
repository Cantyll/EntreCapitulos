import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Resposta da interface (PR de carregamento e resposta): regras que um arquivo novo poderia quebrar sem ninguém ver.
 *  - a linha de progresso da navegação está no layout raiz;
 *  - os menus e os botões-link marcam o toque na hora (`LinkPending`);
 *  - nenhum `loading.tsx` no painel: ele transformaria o 403 e o 404 das páginas abaixo em 200;
 *  - as páginas do painel com esqueleto fazem o `requireRole` ANTES do `Suspense`;
 *  - a linha de progresso só anima `transform` e `opacity` (Safari).
 */
const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('resposta da interface', () => {
  it('o layout raiz monta a linha de progresso da navegação', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toMatch(
      /import \{ NavigationProgress \} from '@\/components\/ui\/NavigationProgress'/,
    );
    expect(layout).toMatch(/<NavigationProgress \/>/);
  });

  it.each([
    'src/components/site/SiteNav.tsx',
    'src/components/admin/AdminNav.tsx',
    'src/components/admin/AdminTabBar.tsx',
    'src/components/ui/Button.tsx',
  ])('%s marca o link tocado com LinkPending', (file) => {
    expect(read(file)).toMatch(/<LinkPending \/>/);
  });

  it('não há loading.tsx no painel (o 403 e o 404 virariam 200)', () => {
    const offenders = walk(join(ROOT, 'src/app/painel')).filter((f) => f.endsWith('/loading.tsx'));
    expect(offenders).toEqual([]);
  });

  it.each([
    'src/app/painel/livros/page.tsx',
    'src/app/painel/sessoes/page.tsx',
    'src/app/painel/sobre/page.tsx',
    'src/app/painel/comentarios/page.tsx',
  ])('%s checa o papel antes do Suspense', (file) => {
    const code = read(file);
    const role = code.indexOf('await requireRole(');
    const suspense = code.indexOf('<Suspense');
    expect(role).toBeGreaterThan(-1);
    expect(suspense).toBeGreaterThan(role);
    expect(code).toMatch(/<PanelSkeleton/);
  });

  it('a linha de progresso só anima transform e opacity', () => {
    const css = read('src/components/ui/NavigationProgress.module.css');
    expect(existsSync(join(ROOT, 'src/components/ui/NavigationProgress.module.css'))).toBe(true);
    const properties = [...css.matchAll(/transition:\s*([^;]+);/g)]
      // Separa as propriedades pelas vírgulas de fora dos parênteses (`cubic-bezier(.1, .6, .2, 1)` é um valor só).
      .flatMap((m) => (m[1] ?? '').split(/,(?![^(]*\))/))
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
    expect(properties.length).toBeGreaterThan(0);
    for (const property of properties) expect(['transform', 'opacity']).toContain(property);
  });
});
