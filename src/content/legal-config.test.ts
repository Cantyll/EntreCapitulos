import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { A_DEFINIR, isLegalDraft, legalConfig, pendingFields, pendingItems } from './legal-config';

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

  it('os campos que dependiam de análise jurídica foram preenchidos com PROPOSTAS (não ficam A DEFINIR)', () => {
    for (const field of ['legalBases', 'internationalTransfer', 'retention', 'requestDeadline']) {
      expect(legalConfig[field as keyof typeof legalConfig]).not.toBe(A_DEFINIR);
    }
    expect(legalConfig.regions.cloudflareTurnstile).not.toBe(A_DEFINIR);
    expect(legalConfig.regions.google).not.toBe(A_DEFINIR);
  });

  it('cada campo preenchido leva o comentário "// PROPOSTA: validar com advogado" logo acima', () => {
    const source = readFileSync(join(process.cwd(), 'src/content/legal-config.ts'), 'utf8');
    for (const field of [
      'cloudflareTurnstile',
      'google',
      'legalBases',
      'internationalTransfer',
      'retention',
      'requestDeadline',
    ]) {
      expect(source, field).toMatch(
        new RegExp(`// PROPOSTA: validar com advogado\\n\\s+${field}:`),
      );
    }
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

  it('hoje a única pendência é a revisão profissional (legalReviewed)', () => {
    expect(pendingFields(legalConfig)).toEqual([]);
    expect(pendingItems(legalConfig)).toEqual(['legalReviewed']);
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
