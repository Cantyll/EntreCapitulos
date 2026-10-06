import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  A_DEFINIR,
  PROPOSAL_FIELDS,
  VALIDATED_FIELDS,
  isLegalDraft,
  legalConfig,
  pendingFields,
  pendingItems,
} from './legal-config';

describe('legalConfig', () => {
  it('tem os campos informados pela dona do projeto', () => {
    expect(legalConfig.controllerName).toBe('Felipe Almeida e Agatha Montinelli');
    expect(legalConfig.privacyContactEmail).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    expect(Number.isInteger(legalConfig.minimumAge)).toBe(true);
    expect(legalConfig.lastUpdated).toMatch(/^\d{1,2} de [a-zç]+ de \d{4}$/);
  });

  it('não afirma que os dados ficam no Brasil nem que não há transferência internacional', () => {
    const text = JSON.stringify(legalConfig).toLowerCase();
    expect(text).not.toContain('não saem do brasil');
    expect(text).not.toContain('não há transferência internacional');
  });

  it('os campos que dependiam de análise jurídica foram preenchidos (nenhum fica A DEFINIR, fora a retenção da auditoria)', () => {
    for (const field of ['legalBases', 'internationalTransfer', 'retention', 'requestDeadline']) {
      expect(legalConfig[field as keyof typeof legalConfig]).not.toBe(A_DEFINIR);
    }
    expect(legalConfig.regions.cloudflareTurnstile).not.toBe(A_DEFINIR);
    expect(legalConfig.regions.google).not.toBe(A_DEFINIR);
    expect(legalConfig.backups.internationalTransfer).not.toBe(A_DEFINIR);
    expect(legalConfig.backups.retention).not.toBe(A_DEFINIR);
  });

  /** O último trecho do caminho (`regions.google` → `google`). */
  const key = (field: string) => field.split('.').pop()!;

  it('cada campo de PROPOSTA leva o comentário "// PROPOSTA: validar com advogado" logo acima', () => {
    const source = readFileSync(join(process.cwd(), 'src/content/legal-config.ts'), 'utf8');
    for (const field of PROPOSAL_FIELDS) {
      expect(source, field).toMatch(
        new RegExp(`// PROPOSTA: validar com advogado\\n\\s+${key(field)}:`),
      );
    }
  });

  it('cada campo VALIDADO leva o comentário "// VALIDADO pelo advogado" logo acima', () => {
    const source = readFileSync(join(process.cwd(), 'src/content/legal-config.ts'), 'utf8');
    for (const field of VALIDATED_FIELDS) {
      expect(source, field).toMatch(
        new RegExp(
          `// VALIDADO pelo advogado \\(informado pelo dono do site\\)\\n\\s+${key(field)}:`,
        ),
      );
    }
  });

  it('PROPOSAL_FIELDS e VALIDATED_FIELDS listam exatamente os campos marcados no arquivo, sem repetir nenhum', () => {
    const source = readFileSync(join(process.cwd(), 'src/content/legal-config.ts'), 'utf8');
    expect(source.match(/^\s*\/\/ PROPOSTA: validar com advogado$/gm)).toHaveLength(
      PROPOSAL_FIELDS.length,
    );
    expect(
      source.match(/^\s*\/\/ VALIDADO pelo advogado \(informado pelo dono do site\)$/gm),
    ).toHaveLength(VALIDATED_FIELDS.length);
    expect(PROPOSAL_FIELDS.length).toBe(8);
    expect(VALIDATED_FIELDS.length).toBe(4);
    const all = [...PROPOSAL_FIELDS, ...VALIDATED_FIELDS] as string[];
    expect(new Set(all).size).toBe(all.length);
  });

  it('o que o advogado validou e o que é proposta, como o dono do site informou', () => {
    expect([...VALIDATED_FIELDS].sort()).toEqual(
      ['backups.retention', 'dataProtectionOfficer', 'legalBases', 'requestDeadline'].sort(),
    );
    expect([...PROPOSAL_FIELDS].sort()).toEqual(
      [
        'minimumAge',
        'internationalTransfer',
        'backups.internationalTransfer',
        'deletionRegistry',
        'regions.cloudflareTurnstile',
        'regions.google',
        'regions.cloudflareR2',
        'retention',
      ].sort(),
    );
  });

  it('a idade mínima é 18 (decisão do dono do site; ECA Digital)', () => {
    expect(legalConfig.minimumAge).toBe(18);
  });

  it('a retenção das cópias usa os números do backup.config.json (14 e 56 dias): mudou lá, mude aqui', () => {
    const backup = JSON.parse(
      readFileSync(join(process.cwd(), '.github/backup.config.json'), 'utf8'),
    ) as { retentionDays: { daily: number; weekly: number } };
    expect(legalConfig.backups.retention).toContain(
      `${backup.retentionDays.daily} dias (as diárias)`,
    );
    expect(legalConfig.backups.retention).toContain(
      `${backup.retentionDays.weekly} dias (as semanais)`,
    );
    // O registro mínimo de exclusões usa a retenção semanal (a mais longa), como o expurgo do banco.
    const registry = (legalConfig.retention as readonly string[]).find((item) =>
      item.startsWith('Registro mínimo de exclusões'),
    );
    expect(registry).toContain(`${backup.retentionDays.weekly} dias`);
    expect(legalConfig.backups.retention).toContain(
      'Se o provedor do banco de dados mantiver cópias próprias, elas seguem o prazo dele.',
    );
  });

  it('as propostas não afirmam que os dados ficam só no Brasil', () => {
    const text = JSON.stringify(legalConfig).toLowerCase();
    expect(text).toContain('podem ocorrer fora do brasil');
    expect(text).not.toMatch(/n[ãa]o saem do brasil|n[ãa]o h[áa] transfer[êe]ncia internacional/);
  });

  it('LISTA os pendentes (informativo: nunca falha o CI)', () => {
    const pending = pendingItems(legalConfig);
    console.info(
      `[legal-config] ${pending.length} pendência(s) para as páginas legais deixarem de ser rascunho:\n  - ${pending.join('\n  - ')}`,
    );
    expect(Array.isArray(pending)).toBe(true);
  });

  it('hoje as pendências são a retenção da auditoria e a revisão profissional', () => {
    expect(pendingFields(legalConfig).sort()).toEqual(['audit.retention']);
    expect(pendingItems(legalConfig).sort()).toEqual(['audit.retention', 'legalReviewed']);
  });

  it('legalReviewed continua false: preencher os campos não tira o rascunho', () => {
    expect(legalConfig.legalReviewed).toBe(false);
    expect(isLegalDraft()).toBe(true);
  });
});

describe('pendingFields, pendingItems e isLegalDraft', () => {
  it('pendingItems soma os campos A DEFINIR e a revisão que falta', () => {
    expect(pendingItems({ legalReviewed: false, a: A_DEFINIR })).toEqual(['a', 'legalReviewed']);
    expect(pendingItems({ legalReviewed: true, a: A_DEFINIR })).toEqual(['a']);
    expect(pendingItems({ legalReviewed: true, a: 'ok' })).toEqual([]);
  });

  it('acha os pendentes em qualquer profundidade', () => {
    expect(pendingFields({ a: A_DEFINIR, b: { c: A_DEFINIR, d: 'ok' }, e: 3 })).toEqual([
      'a',
      'b.c',
    ]);
  });

  it('é rascunho enquanto legalReviewed for false, mesmo sem nenhum campo pendente', () => {
    expect(isLegalDraft({ legalReviewed: false, x: 'ok' })).toBe(true);
  });

  it('é rascunho com campo pendente, mesmo revisado', () => {
    expect(isLegalDraft({ legalReviewed: true, x: A_DEFINIR })).toBe(true);
  });

  it('só deixa de ser rascunho com tudo preenchido E revisado', () => {
    expect(isLegalDraft({ legalReviewed: true, x: 'ok' })).toBe(false);
  });

  it('o padrão entregue é rascunho', () => {
    expect(legalConfig.legalReviewed).toBe(false);
    expect(isLegalDraft()).toBe(true);
  });
});
