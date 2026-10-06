import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { legalConfig } from '../legal-config';
import { buildTerms } from './terms';
import { TERMS_CHANGELOG, TERMS_VERSION } from './version';

/*
 * A versão dos Termos acompanha o texto. Este teste guarda a IMPRESSÃO DIGITAL (SHA-256) do texto integral de `/termos`
 * (os combinados da comunidade estão dentro dele) de cada versão publicada. Se o texto mudar sem que a versão suba,
 * falha: quem já aceitou a versão anterior precisa ver o aviso "Atualizamos os Termos".
 *
 * Mudou o texto? (1) suba `TERMS_VERSION` em `version.ts` (sufixo ".2", ".3"… se a data coincidir) e
 * `legalConfig.lastUpdated`; (2) acrescente a entrada em `TERMS_CHANGELOG` (vai para `docs/revisao-juridica.md`);
 * (3) ACRESCENTE aqui uma linha com a versão nova e a impressão digital que o teste mostrar; (4) atualize o aceite do
 * `supabase/seed.sql` (outro teste confere). Só se acrescenta: nunca troque a impressão digital de uma versão antiga.
 */
const FINGERPRINTS: readonly { version: string; sha256: string }[] = [
  {
    version: '2026-10-06',
    sha256: '58eb9c7f324345d9141dff5c5f1773a09f9696fc712f6be370aa8f2a787b1222',
  },
  {
    version: '2026-10-06.2',
    sha256: 'c1c0c8bc3cca723cf6b4f4b1913e498a273c18f95bbf5a613d45c36f8ff29e18',
  },
];

function termsText(): string {
  const doc = buildTerms(legalConfig);
  return [
    doc.title,
    doc.lead,
    ...doc.sections.flatMap((section) => [
      section.title,
      ...section.blocks.flatMap((block) => {
        switch (block.type) {
          case 'p':
          case 'note':
            return [block.text];
          case 'ul':
            return [...block.items];
          case 'table':
            return [block.caption, ...block.head, ...block.rows.flat()];
        }
      }),
    ]),
  ].join('\n');
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('versão dos Termos × texto', () => {
  const last = FINGERPRINTS[FINGERPRINTS.length - 1]!;

  it('a última impressão digital é a da versão atual', () => {
    expect(last.version).toBe(TERMS_VERSION);
  });

  it('o texto atual dos Termos tem a impressão digital registrada (senão: suba a versão)', () => {
    expect(
      sha256(termsText()),
      'O texto de /termos (ou dos combinados) mudou: suba TERMS_VERSION e lastUpdated, acrescente a entrada em ' +
        'TERMS_CHANGELOG e uma linha nova em FINGERPRINTS (veja o comentário no topo deste arquivo).',
    ).toBe(last.sha256);
  });

  it('as versões só crescem e nenhuma repete versão nem impressão digital', () => {
    const versions = FINGERPRINTS.map((item) => item.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort()).toEqual(versions);
    const shas = FINGERPRINTS.map((item) => item.sha256);
    expect(new Set(shas).size).toBe(shas.length);
  });

  it('o histórico de mudanças tem uma entrada para cada versão, na mesma ordem, e nenhuma vazia', () => {
    expect(TERMS_CHANGELOG.map((entry) => entry.version)).toEqual(
      FINGERPRINTS.map((item) => item.version),
    );
    for (const entry of TERMS_CHANGELOG) expect(entry.changes.length).toBeGreaterThan(0);
  });
});
