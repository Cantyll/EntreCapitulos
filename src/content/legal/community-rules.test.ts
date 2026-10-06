import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COMMUNITY_RULES } from './community-rules';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/*
 * Os combinados da comunidade (etapa 8j) são regra do clube e entram nos Termos que a pessoa aceita: vivem em código
 * (`community-rules.ts`), nunca no conteúdo editável da página Sobre.
 */
describe('combinados da comunidade', () => {
  it('são cinco regras, com título e texto únicos e não vazios', () => {
    expect(COMMUNITY_RULES).toHaveLength(5);
    expect(new Set(COMMUNITY_RULES.map((rule) => rule.title)).size).toBe(5);
    for (const rule of COMMUNITY_RULES) {
      expect(rule.title.trim()).not.toBe('');
      expect(rule.text.trim()).not.toBe('');
    }
  });

  it('a regra "Conteúdo adequado" tem o texto ditado pelo dono do site e está marcada para validar', () => {
    const rule = COMMUNITY_RULES.find((item) => item.title === 'Conteúdo adequado');
    expect(rule?.text).toBe(
      'Sem conteúdo sexual explícito nem palavrões pesados; a moderação pode remover comentários que descumpram os combinados.',
    );
    expect(read('src/content/legal/community-rules.ts')).toMatch(/validar com o advogado/);
  });

  it('/termos usa a constante de código, não o conteúdo editável da página Sobre', () => {
    const terms = read('src/content/legal/terms.ts');
    expect(terms).toMatch(/from '\.\/community-rules'/);
    expect(terms).not.toMatch(/from '\.\.\/sobre'|content\/sobre|lib\/about/);
    expect(terms).toContain('COMMUNITY_RULES.map(');
  });

  it('o conteúdo padrão da página Sobre (src/content/sobre.ts) não tem combinados', () => {
    expect(read('src/content/sobre.ts')).not.toMatch(/\brules\s*:/);
  });
});
