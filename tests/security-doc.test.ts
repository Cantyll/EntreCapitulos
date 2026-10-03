import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DB_CONTAINER, buildSecurityInventory } from './support/security-inventory';

/*
 * docs/seguranca.md é GERADO do banco local. Este teste compara o inventário real com o arquivo e falha
 * se divergirem (uma migration mudou permissões e ninguém atualizou o documento).
 *
 * Só roda com banco: defina SECURITY_DOC_DB_CONTAINER com o nome do contêiner do Postgres local
 * (supabase_db_entre-capitulos). O job "Banco" do ci.yml já faz isso; sem a variável o teste é pulado.
 * Regenerar: UPDATE_SECURITY_DOC=1 (junto da variável acima).
 */
const FILE = join(process.cwd(), 'docs/seguranca.md');

describe.skipIf(!DB_CONTAINER)('docs/seguranca.md', () => {
  it('bate com o inventário do banco local', () => {
    const inventory = buildSecurityInventory();
    if (process.env.UPDATE_SECURITY_DOC === '1') writeFileSync(FILE, inventory);
    expect(existsSync(FILE), 'docs/seguranca.md não existe: gere com UPDATE_SECURITY_DOC=1').toBe(
      true,
    );
    expect(
      readFileSync(FILE, 'utf8'),
      'docs/seguranca.md divergiu do banco: regenere com UPDATE_SECURITY_DOC=1',
    ).toBe(inventory);
  });
});
