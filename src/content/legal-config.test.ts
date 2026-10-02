import { describe, expect, it } from 'vitest';

import { A_DEFINIR, isLegalDraft, legalConfig, pendingFields } from './legal-config';

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

  it('os campos que dependem de análise jurídica continuam A DEFINIR', () => {
    expect(legalConfig.legalBases).toBe(A_DEFINIR);
    expect(legalConfig.internationalTransfer).toBe(A_DEFINIR);
    expect(legalConfig.retention).toBe(A_DEFINIR);
  });

  it('LISTA os pendentes (informativo: nunca falha o CI)', () => {
    const pending = pendingFields(legalConfig);
    console.info(
      `[legal-config] ${pending.length} campo(s) A DEFINIR, revisão profissional ${
        legalConfig.legalReviewed ? 'feita' : 'pendente'
      }:\n  - ${pending.join('\n  - ')}`,
    );
    expect(Array.isArray(pending)).toBe(true);
  });
});

describe('pendingFields e isLegalDraft', () => {
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
