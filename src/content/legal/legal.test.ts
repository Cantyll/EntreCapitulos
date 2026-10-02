import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  A_DEFINIR,
  legalConfig,
  pendingFields,
  pendingItems,
  type LegalData,
} from '../legal-config';
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

/** A configuração de antes dos campos serem preenchidos (tudo A DEFINIR). */
const pending: LegalData = {
  ...legalConfig,
  regions: { ...legalConfig.regions, cloudflareTurnstile: A_DEFINIR, google: A_DEFINIR },
  legalBases: A_DEFINIR,
  internationalTransfer: A_DEFINIR,
  retention: A_DEFINIR,
  requestDeadline: A_DEFINIR,
};

const OFF = { google: false, turnstile: false };
const ON = { google: true, turnstile: true };

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

  it('campo ainda pendente: a frase única com A DEFINIR (e nada mais)', () => {
    const t = allText(buildPrivacy(pending, OFF));
    for (const label of [
      'bases legais da LGPD \\(art. 7º\\) que justificam cada finalidade',
      'Transferência internacional de dados',
      'Por quanto tempo guardamos cada tipo de dado',
      'Prazo para responder aos pedidos',
    ]) {
      expect(t).toMatch(new RegExp(`${label}: ${A_DEFINIR}\\.`, 'i'));
    }
  });

  it('campo preenchido: mostra o conteúdo da proposta, em lista quando é lista', () => {
    const doc = buildPrivacy(legalConfig, OFF);
    const bases = doc.sections.find((s) => s.id === 'bases-legais')!;
    const retention = doc.sections.find((s) => s.id === 'retencao')!;
    expect(bases.blocks.some((b) => b.type === 'ul' && b.items.length === 4)).toBe(true);
    expect(retention.blocks.some((b) => b.type === 'ul' && b.items.length === 6)).toBe(true);
    expect(text).toContain('execução de contrato (art. 7º, V, da LGPD)');
    expect(text).toContain('legítimo interesse (art. 7º, IX)');
    expect(text).toContain('Respondemos aos pedidos em até 15 dias');
    expect(text).toContain('Cópias de segurança');
  });

  it('enquanto não houver revisão, cada ponto preenchido avisa que precisa de um advogado', () => {
    expect(text.match(/ainda precisa ser validado por um advogado/g)).toHaveLength(4);
    const reviewed = allText(buildPrivacy({ ...legalConfig, legalReviewed: true }, OFF));
    expect(reviewed).not.toContain('validado por um advogado');
  });

  it('com a transferência preenchida, não repete o parágrafo genérico', () => {
    expect(text).not.toContain('Esses serviços são de empresas internacionais');
    expect(allText(buildPrivacy(pending, OFF))).toContain(
      'Esses serviços são de empresas internacionais',
    );
  });

  it('NUNCA afirma que os dados não saem do Brasil nem que não há transferência internacional', () => {
    for (const features of [OFF, ON]) {
      const t = allText(buildPrivacy(legalConfig, features)).toLowerCase();
      expect(t).not.toMatch(/n[ãa]o saem do brasil/);
      expect(t).not.toMatch(/n[ãa]o h[áa] transfer[êe]ncia internacional/);
      expect(t).not.toMatch(/ficam (todos )?no brasil/);
    }
    expect(text).toContain('podem ocorrer fora do Brasil');
  });

  it('lista os serviços usados pelo código; Google e Turnstile só na TABELA se ativados', () => {
    const rows = (features: typeof OFF) =>
      buildPrivacy(legalConfig, features)
        .sections.find((s) => s.id === 'compartilhamento')!
        .blocks.flatMap((b) => (b.type === 'table' ? b.rows.map((r) => r[0]) : []));
    expect(rows(OFF)).toEqual(['Supabase', 'Vercel', 'Resend']);
    expect(rows(ON)).toEqual(['Supabase', 'Vercel', 'Resend', 'Google', 'Cloudflare Turnstile']);
    const on = allText(buildPrivacy(legalConfig, ON));
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

  it('com a configuração entregue, não sobra "A DEFINIR" no texto (menos a conferência do Turnstile)', () => {
    expect(allText(buildPrivacy(legalConfig, { google: true, turnstile: false }))).not.toContain(
      A_DEFINIR,
    );
  });

  it('conferir antes de ativar o Turnstile fica visível como A DEFINIR no texto', () => {
    expect(allText(buildPrivacy(legalConfig, ON))).toContain(A_DEFINIR);
  });

  it('o Resend é contratado por nós e acionado pelo Supabase (não "contratado pelo Supabase")', () => {
    expect(text).toContain('contratado por nós e acionado pelo Supabase');
    expect(text).not.toContain('contratado pelo Supabase');
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
  it('nenhum campo ficou A DEFINIR; a única pendência é a revisão profissional', () => {
    expect(pendingFields(legalConfig)).toEqual([]);
    expect(pendingItems(legalConfig)).toEqual(['legalReviewed']);
  });

  it('a configuração de antes (tudo pendente) é detectada campo a campo', () => {
    expect(pendingFields(pending).sort()).toEqual(
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
