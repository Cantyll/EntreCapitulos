import { describe, expect, it } from 'vitest';

import { legalConfig } from '@/content/legal-config';
import { TERMS_VERSION } from '@/content/legal/version';
import { classifyCommentError, COMMENT_MESSAGES } from '@/lib/comments';

import { TERMS_MESSAGES, classifyAcceptError, isTermsUnavailable } from './errors';
import {
  acceptHref,
  blocksCommenting,
  classifyTermsRow,
  isNoticeHiddenPath,
  needsTermsNotice,
} from './status';

describe('TERMS_VERSION', () => {
  it('cabe na coluna (1 a 32 caracteres) e tem o formato AAAA-MM-DD', () => {
    expect(TERMS_VERSION.length).toBeGreaterThanOrEqual(1);
    expect(TERMS_VERSION.length).toBeLessThanOrEqual(32);
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('é a data da última atualização dos textos legais (mudou o texto, mude as duas)', () => {
    const months = [
      'janeiro',
      'fevereiro',
      'março',
      'abril',
      'maio',
      'junho',
      'julho',
      'agosto',
      'setembro',
      'outubro',
      'novembro',
      'dezembro',
    ];
    const [year, month, day] = TERMS_VERSION.split('-').map(Number) as [number, number, number];
    expect(legalConfig.lastUpdated).toBe(`${day} de ${months[month - 1]} de ${year}`);
  });
});

describe('classifyTermsRow', () => {
  it('sem linha: nunca aceitou', () => {
    expect(classifyTermsRow(null)).toBe('missing');
    expect(classifyTermsRow(undefined)).toBe('missing');
  });

  it('versão atual: aceitou; outra versão: desatualizado (pede de novo, sem bloquear)', () => {
    expect(classifyTermsRow(TERMS_VERSION)).toBe('accepted');
    expect(classifyTermsRow('2020-01-01')).toBe('outdated');
    expect(classifyTermsRow('2026-10-05', '2026-10-06')).toBe('outdated');
    expect(classifyTermsRow('2026-10-06', '2026-10-06')).toBe('accepted');
  });
});

describe('aviso e bloqueio', () => {
  it('o aviso aparece para quem nunca aceitou ou aceitou versão antiga, e nunca no estado desconhecido', () => {
    expect(needsTermsNotice('missing')).toBe(true);
    expect(needsTermsNotice('outdated')).toBe(true);
    expect(needsTermsNotice('accepted')).toBe(false);
    expect(needsTermsNotice('unknown')).toBe(false);
  });

  it('só o membro que NUNCA aceitou fica sem o compositor: equipe é isenta, versão antiga e leitura falha não bloqueiam', () => {
    expect(blocksCommenting('member', 'missing')).toBe(true);
    expect(blocksCommenting('member', 'outdated')).toBe(false);
    expect(blocksCommenting('member', 'accepted')).toBe(false);
    expect(blocksCommenting('member', 'unknown')).toBe(false);
    for (const role of ['admin', 'moderator'] as const) {
      expect(blocksCommenting(role, 'missing')).toBe(false);
    }
  });

  it('o aviso não aparece em /entrar, /boas-vindas nem /conta/excluida (e subcaminhos)', () => {
    for (const path of ['/entrar', '/boas-vindas', '/boas-vindas/', '/conta/excluida', '/ENTRAR']) {
      expect(isNoticeHiddenPath(path), path).toBe(true);
    }
    for (const path of ['/', '/sessoes', '/conta', '/painel', '/livros/o-livro-de-azrael']) {
      expect(isNoticeHiddenPath(path), path).toBe(false);
    }
  });

  it('o caminho para aceitar volta para a página de origem', () => {
    expect(acceptHref('/')).toBe('/boas-vindas');
    expect(acceptHref('/sessoes?x=1')).toBe('/boas-vindas?next=%2Fsessoes%3Fx%3D1');
  });
});

describe('erros', () => {
  it('o comentário recusado por falta de aceite tem mensagem própria, pelo prefixo do banco', () => {
    expect(
      classifyCommentError({
        code: '23514',
        message: 'terms_not_accepted: accept the Terms and the Privacy Policy before commenting',
      }),
    ).toBe('terms_not_accepted');
    expect(COMMENT_MESSAGES.terms_not_accepted).toBe(
      'Para comentar, aceite os Termos e a Política de Privacidade.',
    );
  });

  it('o aceite: função ausente vira "ainda não disponível"; sem login, pede para entrar; o resto é genérico', () => {
    expect(isTermsUnavailable({ code: 'PGRST202' })).toBe(true);
    expect(isTermsUnavailable({ code: '42P01' })).toBe(true);
    expect(isTermsUnavailable({ code: '23514' })).toBe(false);
    expect(classifyAcceptError({ code: 'PGRST202' })).toBe('unavailable');
    expect(classifyAcceptError({ code: '42883' })).toBe('unavailable');
    expect(classifyAcceptError({ code: '42501', message: 'not_signed_in: sign in' })).toBe(
      'not_signed_in',
    );
    expect(classifyAcceptError({ code: '22023', message: 'invalid_version: x' })).toBe('generic');
    expect(classifyAcceptError(null)).toBe('generic');
  });

  it('nenhuma mensagem diz que a idade foi verificada ou confirmada: é uma declaração', () => {
    for (const text of Object.values(TERMS_MESSAGES)) {
      expect(text).not.toMatch(/verificad|confirmad|comprovad/i);
    }
  });
});
