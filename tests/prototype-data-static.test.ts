import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Nenhuma tela pode mostrar nome, número ou texto INVENTADO. O protótipo (docs/prototype) é só
 * referência visual: os membros, os números e os textos dele são fictícios. Este teste falha se algum
 * deles voltar para src/ (por exemplo, "128 membros" numa tela que ainda não tem dado de verdade).
 *
 * Não entram: "Agatha Montinelli" (a dona do site, nome real) nem o livro "O Livro de Azrael".
 */
const ROOT = process.cwd();

const FAKE_PEOPLE = [
  'Mariana Rocha',
  'Júlia Prado',
  'Pedro Henrique',
  'Camila Souza',
  'Renata Alves',
  'Beatriz Nunes',
  'Lucas Ferreira',
  'Gustavo Reis',
  'Fernanda Lima',
  'Ana Clara',
  'Sofia Andrade',
  'Carol Dias',
  'promo_livros_baratos',
];

const FAKE_AUTHORS = [
  'Beatriz Lemos',
  'Clara Menezes',
  'Daniel Kort',
  'Hugo Fontes',
  'Ingrid Sato',
  'Lia Moraes',
  'Rafael Duarte',
  'Tomás Reis',
];

const FAKE_FIGURES = [
  '128 membros',
  'e mais 122',
  '+9 nesta semana',
  '+23% sobre a semana anterior',
  '75% dos membros',
  '48% dos membros',
  'Recebem por e-mail',
  'Comentaram este mês',
];

const FAKE_TEXTS = [
  'a playlist que eu ouvi lendo Azrael',
  'Balanço de setembro',
  'Alguém mais achou o capítulo 12 mais lento',
  'Compre livros com 90% de desconto',
];

const ALL = [...FAKE_PEOPLE, ...FAKE_AUTHORS, ...FAKE_FIGURES, ...FAKE_TEXTS];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('dados do protótipo fora de src/', () => {
  const prototype = readFileSync(join(ROOT, 'docs/prototype/entre-capitulos.html'), 'utf8');

  it('a lista é do protótipo de verdade (sem entrada velha)', () => {
    expect(ALL.filter((item) => !prototype.includes(item))).toEqual([]);
  });

  it('nenhum arquivo de src/ traz nome, número ou texto de exemplo do protótipo', () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, 'src'))) {
      if (!/\.(tsx?|css|json|md|html|svg)$/.test(file) || /\.test\.tsx?$/.test(file)) continue; // dados de teste podem usar nomes
      const text = readFileSync(file, 'utf8');
      for (const item of ALL) {
        if (text.includes(item)) offenders.push(`${file.slice(ROOT.length + 1)}: ${item}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
