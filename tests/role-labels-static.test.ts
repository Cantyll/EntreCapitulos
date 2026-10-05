import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROLE_LABELS } from '@/lib/auth/roles';

/*
 * Rótulos dos cargos (etapa 8f). Qualquer texto que apareça para alguém usa `ROLE_LABELS`
 * (Administração, Moderação, Membro): pode haver mais de uma conta em cada cargo, então "administradora",
 * "moderadora" e o selo "Autora" não podem voltar escritos à mão. "A autora" em `/sobre` é a pessoa
 * (a Agatha), não o cargo, e não casa com a regra (que olha só a palavra com inicial maiúscula como selo).
 */
const ROOT = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sources = walk(join(ROOT, 'src'))
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
  .map((file) => ({
    path: relative(ROOT, file),
    // Só o código e os textos: comentários (que documentam a regra) não contam.
    code: readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1'),
  }));

describe('rótulos dos cargos', () => {
  it('os rótulos são os neutros aprovados', () => {
    expect(ROLE_LABELS).toEqual({
      admin: 'Administração',
      moderator: 'Moderação',
      member: 'Membro',
    });
  });

  it('há código para conferir', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('nenhum texto do site escreve "administradora" ou "moderadora" à mão', () => {
    const offenders = sources
      .filter(({ code }) => /\b(administradoras?|moderadoras?)\b/i.test(code))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('o selo público não volta a ser "Autora" (o cargo é Administração)', () => {
    const offenders = sources.filter(({ code }) => /\bAutora\b/.test(code)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('o selo dos comentários e o da moderação vêm de ROLE_LABELS', () => {
    for (const file of [
      'src/components/comments/CommentItem.tsx',
      'src/components/moderacao/ModerationBoard.tsx',
    ]) {
      const code = readFileSync(join(ROOT, file), 'utf8');
      expect(code, file).toMatch(
        /ROLE_BADGE = \{ admin: ROLE_LABELS\.admin, moderator: ROLE_LABELS\.moderator \}/,
      );
    }
  });
});
