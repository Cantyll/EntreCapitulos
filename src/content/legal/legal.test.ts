import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { A_DEFINIR, legalConfig, pendingFields, type LegalData } from '../legal-config';
import { SOBRE } from '../sobre';
import { SITE_COOKIES } from './cookies';
import { buildPrivacy } from './privacy';
import { buildTerms } from './terms';
import type { LegalDoc } from './types';

const allText = (doc: LegalDoc): string =>
  [
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

const OFF = { google: false, turnstile: false };
const ON = { google: true, turnstile: true };

const filled: LegalData = {
  ...legalConfig,
  legalReviewed: true,
  regions: { ...legalConfig.regions, cloudflareTurnstile: 'Global', google: 'Global' },
  legalBases: 'consentimento e execução de contrato',
  internationalTransfer: 'cláusulas-padrão',
  retention: '5 anos',
  requestDeadline: '15 dias',
};

describe('política de privacidade', () => {
  const text = allText(buildPrivacy(legalConfig, OFF));

  it('usa os dados informados em legal-config.ts', () => {
    expect(text).toContain(legalConfig.controllerName);
    expect(text).toContain(legalConfig.privacyContactEmail);
    expect(text).toContain(`${legalConfig.minimumAge} anos`);
    expect(text).toContain(legalConfig.lastUpdated);
    expect(text).toContain('São Paulo (Brasil)');
    expect(text).toContain('São Paulo (gru1, Brasil)');
    expect(text).toContain('São Paulo (sa-east-1)');
  });

  it('deixa A DEFINIR o que depende de análise jurídica', () => {
    for (const label of [
      'Bases legais',
      'Transferência internacional',
      'Prazos de retenção',
      'Prazo para responder',
    ]) {
      expect(text).toMatch(new RegExp(`${label}[^\\n]*${A_DEFINIR}`, 'i'));
    }
    expect(text).toMatch(/bases legais[^\n]*A DEFINIR/i);
  });

  it('NUNCA afirma que os dados não saem do Brasil nem que não há transferência internacional', () => {
    for (const features of [OFF, ON]) {
      const t = allText(buildPrivacy(legalConfig, features)).toLowerCase();
      expect(t).not.toMatch(/n[ãa]o saem do brasil/);
      expect(t).not.toMatch(/n[ãa]o h[áa] transfer[êe]ncia internacional/);
      expect(t).not.toMatch(/ficam (todos )?no brasil/);
    }
    expect(text).toContain('podem envolver outros países');
  });

  it('lista os serviços usados pelo código; Google e Turnstile só se ativados', () => {
    for (const name of ['Supabase', 'Vercel', 'Resend']) expect(text).toContain(name);
    expect(text).not.toContain('Google');
    expect(text).not.toContain('Turnstile');
    const on = allText(buildPrivacy(legalConfig, ON));
    expect(on).toContain('Google');
    expect(on).toContain('Cloudflare Turnstile');
    expect(on).toContain('nome e o endereço da foto do seu perfil Google');
    expect(on).toContain('ec_next');
    expect(text).not.toContain('ec_next');
  });

  it('o Resend é operador do envio do código por e-mail, via Supabase', () => {
    expect(text).toMatch(/Resend\n[^\n]*operador[^\n]*Supabase/);
  });

  it('dados tratados: e-mail, nome, comentários, progresso e registros técnicos', () => {
    for (const piece of [
      'E-mail',
      'Nome de exibição',
      'Comentários e respostas',
      'Progresso de leitura',
      'Registros técnicos',
    ]) {
      expect(text).toContain(piece);
    }
    expect(text).toContain('não usa ferramentas de análise');
  });

  it('avisa que nome e comentários são públicos', () => {
    expect(text).toMatch(/nome de exibição e seus comentários são públicos/);
  });

  it('direitos do art. 18 com os caminhos reais', () => {
    expect(text).toContain('art. 18');
    expect(text).toContain('Minha conta');
    expect(text).toContain('Baixar meus dados');
    expect(text).toContain('Excluir minha conta');
    expect(text).toContain('Excluir meu comentário');
    expect(text).toContain(legalConfig.privacyContactEmail);
  });

  it('cookies: todos essenciais, sem banner, e a lista é a do CLAUDE.md', () => {
    expect(text).toContain('apenas cookies essenciais');
    expect(text).toContain('não há aviso de consentimento');
    for (const name of ['ec_progress', 'sb-…-auth-token']) expect(text).toContain(name);
  });

  it('com tudo preenchido, não sobra "A DEFINIR" no texto (menos a conferência do Turnstile)', () => {
    const t = allText(buildPrivacy(filled, { google: true, turnstile: false }));
    expect(t).not.toContain(A_DEFINIR);
  });

  it('conferir antes de ativar o Turnstile fica visível como A DEFINIR no texto', () => {
    expect(allText(buildPrivacy(filled, ON))).toContain(A_DEFINIR);
  });

  it('ids de seção únicos (âncoras do sumário)', () => {
    for (const features of [OFF, ON]) {
      const ids = buildPrivacy(legalConfig, features).sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('termos de uso', () => {
  const text = allText(buildTerms(legalConfig));

  it('cobre o que foi pedido', () => {
    for (const piece of [
      'O que é o Entre Capítulos',
      'Sua conta',
      'Combinados da comunidade',
      'continua sendo seu',
      'moderação pode remover',
      'cortesia de leitura',
      'sem garantia',
      'Mudanças nestes termos',
      'Contato',
    ]) {
      expect(text.toLowerCase()).toContain(piece.toLowerCase());
    }
    expect(text).toContain(legalConfig.privacyContactEmail);
    expect(text).toContain(legalConfig.lastUpdated);
    expect(text).toContain(`${legalConfig.minimumAge} anos`);
  });

  it('reaproveita os combinados da página Sobre', () => {
    for (const rule of SOBRE.rules) {
      expect(text).toContain(rule.title);
      expect(text).toContain(rule.text);
    }
  });
});

describe('lista de cookies', () => {
  it('está de acordo com a tabela "Cookies do site" do CLAUDE.md', () => {
    const claude = readFileSync(join(process.cwd(), 'CLAUDE.md'), 'utf8');
    const section = claude.slice(
      claude.indexOf('### Cookies do site'),
      claude.indexOf('### Migrations'),
    );
    const documented = [...section.matchAll(/^\| `([^`]+)`/gm)].map((m) => m[1]!);
    expect(documented.length).toBeGreaterThanOrEqual(3);
    expect(SITE_COOKIES.map((cookie) => cookie.name.replace('…', '…'))).toEqual(
      documented.map((name) => (name.startsWith('sb-') ? 'sb-…-auth-token' : name)),
    );
  });

  it('só o do Google depende do login pelo Google', () => {
    expect(SITE_COOKIES.filter((c) => c.only).map((c) => c.name)).toEqual(['ec_next']);
  });
});

describe('detecção dos pendentes na configuração entregue', () => {
  it('lista os campos A DEFINIR (e só eles)', () => {
    expect(pendingFields(legalConfig).sort()).toEqual(
      [
        'internationalTransfer',
        'legalBases',
        'regions.cloudflareTurnstile',
        'regions.google',
        'requestDeadline',
        'retention',
      ].sort(),
    );
  });

  it('nenhum campo ficou como <PREENCHER>', () => {
    expect(JSON.stringify(legalConfig)).not.toContain('<PREENCHER>');
  });
});
