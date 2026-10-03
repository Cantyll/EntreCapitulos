import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Links quebrados entre os documentos: todo link Markdown relativo e toda menção `docs/....md` (ou
 * `supabase/...`, `src/...`) em README.md, CLAUDE.md e docs/*.md precisa apontar para um arquivo que existe.
 * Âncoras (#...) e endereços externos ficam de fora.
 */
const ROOT = process.cwd();
const DOCS = readdirSync(join(ROOT, 'docs'))
  .filter((name) => name.endsWith('.md'))
  .map((name) => join('docs', name));
const FILES = ['README.md', 'CLAUDE.md', ...DOCS];

const MD_LINK = /\]\(([^)\s]+)\)/g;
const PATH_MENTION =
  /`((?:docs|supabase|src|e2e|tests)\/[A-Za-z0-9_./\-[\]()]+\.(?:md|ts|tsx|sql|html|js|toml|yml|css))`/g;

function broken(file: string): string[] {
  const text = readFileSync(join(ROOT, file), 'utf8');
  const problems: string[] = [];
  for (const match of text.matchAll(MD_LINK)) {
    const target = match[1]!;
    if (/^([a-z]+:|#)/i.test(target)) continue;
    const path = decodeURIComponent(target.split('#')[0]!);
    if (!existsSync(resolve(ROOT, dirname(file), path))) problems.push(`${file}: link ${target}`);
  }
  for (const match of text.matchAll(PATH_MENTION)) {
    const path = match[1]!;
    if (path.includes('[') || path.includes('(')) continue; // rotas dinâmicas do Next, não arquivos soltos
    if (!existsSync(join(ROOT, path))) problems.push(`${file}: menção ${path}`);
  }
  return problems;
}

describe('links entre os documentos', () => {
  it('encontra os documentos', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(4);
  });

  it.each(FILES)('%s não tem link nem caminho quebrado', (file) => {
    expect(broken(file)).toEqual([]);
  });
});
