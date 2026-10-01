import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Regras que valem para todo o código e que um arquivo novo poderia quebrar sem ninguém ver:
 *  - nada de HTML montado por string (XSS): nenhum `dangerouslySetInnerHTML` em src/;
 *  - cores só pelos tokens do tema: CSS das páginas e componentes públicos sem cor literal;
 *  - toda leitura do Supabase nas páginas públicas passa por `src/lib/public/`.
 */
const ROOT = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const src = walk(join(ROOT, 'src'));

describe('regras estáticas', () => {
  it('nenhum dangerouslySetInnerHTML em src/', () => {
    const offenders = src
      .filter((f) => /\.(tsx?|jsx?)$/.test(f))
      .filter((f) => !f.endsWith('static-rules.test.ts'))
      .filter((f) => {
        // Só conta uso de verdade: menções em comentário (documentando a regra) não.
        const code = readFileSync(f, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
        return code.includes('dangerouslySetInnerHTML');
      });
    expect(offenders).toEqual([]);
  });

  const publicCss = [
    ...src.filter((f) => f.includes('/components/public/') && f.endsWith('.css')),
    ...src.filter((f) => f.includes('/app/(public)/') && f.endsWith('.css')),
    ...src.filter((f) => f.includes('/lib/session-body/') && f.endsWith('.css')),
  ];

  it('há CSS público para conferir', () => {
    expect(publicCss.length).toBeGreaterThan(8);
  });

  it.each(publicCss.map((f) => [f.slice(ROOT.length + 1)]))(
    '%s: só tokens do tema, sem cor literal',
    (file) => {
      const css = readFileSync(join(ROOT, file as string), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|lab)\(/);
      expect(css).not.toMatch(/:\s*(white|black|red|blue|green|gray|grey)\b/);
    },
  );
});
