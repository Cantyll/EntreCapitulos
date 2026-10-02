import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Regras de comentário que se garantem lendo o código:
 *  - toda leitura de `comments` filtra o estado EXPLICITAMENTE (a equipe lê todos os estados pelo RLS, então
 *    uma consulta sem filtro mostraria pendente ou removido para quem é da equipe);
 *  - toda ação que muda comentário expira o cache público da sessão (`updateTag` via `invalidateComments`);
 *  - nenhuma ação do cliente decide o status.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('leituras públicas de comentários filtram o estado', () => {
  const pieces: [string, string, RegExp][] = [
    ['src/lib/comments/queries.ts', "from('comments')", /\.eq\('status', '(approved|pending)'\)/],
    [
      'src/lib/public/queries.ts',
      "select('id, comments(count)')",
      /\.eq\('comments\.status', 'approved'\)/,
    ],
    [
      'src/lib/public/person.ts',
      'SESSION_LIST_COLUMNS}, comments(count)',
      /\.eq\('comments\.status', 'approved'\)/,
    ],
  ];

  it.each(pieces)('%s: cada consulta de %s traz o filtro de estado', (file, marker, filter) => {
    const parts = read(file).split(marker).slice(1);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      // O filtro vem na mesma cadeia, logo depois do `select`.
      expect(part.slice(0, 700), `${file}: consulta sem filtro de estado`).toMatch(filter);
    }
  });

  it('o autor só enxerga os PRÓPRIOS pendentes (filtro por autor e por estado)', () => {
    const source = read('src/lib/comments/queries.ts');
    const own = source.slice(source.indexOf('getOwnPendingComments'));
    expect(own).toMatch(/\.eq\('author_id', userId\)/);
    expect(own).toMatch(/\.eq\('status', 'pending'\)/);
  });
});

describe('invalidações', () => {
  it('createComment expira a lista da sessão e as contagens', () => {
    const source = read('src/app/(public)/comment-actions.ts');
    const create = source.slice(
      source.indexOf('export async function createComment'),
      source.indexOf('export type MoreCommentsResult'),
    );
    expect(create).toMatch(/invalidateComments\(/);
  });

  it('as tags de comentário estão ligadas ao updateTag', () => {
    const tags = read('src/lib/public/tags.ts');
    expect(tags).toMatch(/updateTag\(COMMENT_COUNTS_TAG\)/);
    expect(tags).toMatch(/updateTag\(commentsTag\(sessionId\)\)/);
  });

  it('salvar a sessão (inclui abrir e fechar os comentários) também expira os comentários', () => {
    const source = read('src/app/painel/sessoes/actions.ts');
    const refresh = source.slice(
      source.indexOf('function refreshPublic'),
      source.indexOf('const badId'),
    );
    expect(refresh).toMatch(/invalidateComments\(/);
  });
});

describe('o cliente nunca decide o status', () => {
  it('createComment não lê "status" do formulário nem o põe no insert', () => {
    const source = read('src/app/(public)/comment-actions.ts');
    expect(source).not.toMatch(
      /formData\.get\(['"](status|authorId|author_id|readUpTo|read_up_to|id)['"]\)/,
    );
    const insert = source.slice(
      source.indexOf('.insert({'),
      source.indexOf('.select(', source.indexOf('.insert({')),
    );
    expect(insert).not.toMatch(/\bstatus\b/);
  });
});
