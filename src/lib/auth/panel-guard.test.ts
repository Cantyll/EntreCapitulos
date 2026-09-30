import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guarda: toda página e todo arquivo 'use server' do painel precisam chamar requireRole().
 * O layout sozinho não basta, porque ele não roda de novo a cada navegação.
 */
const PANEL_DIR = join(process.cwd(), 'src', 'app', 'painel');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(PANEL_DIR).filter((path) => /\.(ts|tsx)$/.test(path));
const guarded = files.filter((path) => {
  const source = readFileSync(path, 'utf8');
  return (
    /\/page\.tsx$/.test(path) ||
    /\/layout\.tsx$/.test(path) ||
    /^\s*['"]use server['"]/m.test(source)
  );
});

describe('panel guard', () => {
  it('finds the panel pages', () => {
    expect(guarded.length).toBeGreaterThanOrEqual(9);
  });

  it.each(guarded.map((path) => [relative(process.cwd(), path), path]))(
    '%s calls requireRole()',
    (_label, path) => {
      expect(readFileSync(path, 'utf8')).toMatch(/\brequireRole\(\s*['"](admin|staff)['"]\s*\)/);
    },
  );
});
