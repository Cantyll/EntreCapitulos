import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { INSTALL_RULES } from '../install';
import {
  A_DEFINIR,
  legalConfig,
  pendingFields,
  pendingItems,
  type LegalData,
} from '../legal-config';
import { SOBRE } from '../sobre';
import { ageSentence } from './age';
import { LOCAL_STORAGE_ITEMS, SITE_COOKIES } from './cookies';
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
  backups: { internationalTransfer: A_DEFINIR, retention: A_DEFINIR },
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
    expect(retention.blocks.some((b) => b.type === 'ul' && b.items.length === 8)).toBe(true);
    expect(text).toContain('execução de contrato (art. 7º, V, da LGPD)');
    expect(text).toContain('legítimo interesse (art. 7º, IX)');
    expect(text).toContain('Respondemos aos pedidos em até 15 dias');
    expect(text).toContain('Cópias de segurança');
  });

  it('enquanto não houver revisão, cada ponto de PROPOSTA avisa que precisa de um advogado (e só eles)', () => {
    // Propostas descritas pela política: a idade, a transferência, a retenção, a transferência das cópias e a base
    // do registro mínimo de exclusões. (As regiões entram na tabela, sem aviso por ponto.)
    expect(text.match(/ainda precisa ser validado por um advogado/g)).toHaveLength(5);
    const reviewed = allText(buildPrivacy({ ...legalConfig, legalReviewed: true }, OFF));
    expect(reviewed).not.toContain('validado por um advogado');
  });

  it('os campos VALIDADOS pelo advogado não repetem o aviso: bases legais, prazo, encarregado e retenção das cópias', () => {
    const doc = buildPrivacy(legalConfig, OFF);
    const NOTE = 'Este ponto ainda precisa ser validado por um advogado.';
    // Bloco logo depois do conteúdo de cada campo validado.
    const after = (sectionId: string, marker: string): string | undefined => {
      const blocks = doc.sections.find((s) => s.id === sectionId)!.blocks;
      const index = blocks.findIndex(
        (b) => (b.type === 'p' || b.type === 'ul') && JSON.stringify(b).includes(marker),
      );
      expect(index, `${sectionId}: ${marker}`).toBeGreaterThanOrEqual(0);
      const next = blocks[index + 1];
      return next && next.type === 'p' ? next.text : undefined;
    };
    expect(after('bases-legais', 'execução de contrato (art. 7º, V, da LGPD)')).not.toBe(NOTE);
    expect(after('direitos', 'Respondemos aos pedidos em até 15 dias')).not.toBe(NOTE);
    expect(after('retencao', 'mantidas por 14 dias')).not.toBe(NOTE);
    // O encarregado está no texto, sem aviso, com o e-mail de contato como canal.
    const first = doc.sections.find((s) => s.id === 'quem-controla')!.blocks;
    const dpo = first.findIndex(
      (b) => b.type === 'p' && b.text.includes('dispensado de indicar um encarregado'),
    );
    expect(dpo).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(first[dpo])).toContain(legalConfig.privacyContactEmail);
    expect(first[dpo + 1]).toBeUndefined();
    // Controle: uma PROPOSTA (a base do registro de exclusões) leva o aviso logo depois.
    expect(
      after('bases-legais', 'Cumprimento de obrigação legal ou regulatória (art. 7º, II, da LGPD)'),
    ).toBe(NOTE);
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
    expect(rows(OFF)).toEqual(['Supabase', 'Vercel', 'Resend', 'Cloudflare R2']);
    expect(rows(ON)).toEqual([
      'Supabase',
      'Vercel',
      'Resend',
      'Google',
      'Cloudflare Turnstile',
      'Cloudflare R2',
    ]);
    const on = allText(buildPrivacy(legalConfig, ON));
    expect(on).toContain(
      'Se você escolher entrar com o Google, ele nos informa seu nome, e-mail e foto de perfil.',
    );
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

  it('com a configuração entregue, o único "A DEFINIR" do texto é a retenção da auditoria (menos a conferência do Turnstile)', () => {
    const delivered = allText(buildPrivacy(legalConfig, { google: true, turnstile: false }));
    expect(delivered.match(/A DEFINIR/g)).toHaveLength(1);
    expect(delivered).toContain(
      'Por quanto tempo guardamos o registro das ações da administração: A DEFINIR',
    );
    // As cópias de segurança deixaram de ser pendência (etapa 8g).
    expect(delivered).not.toContain('cópias de segurança: A DEFINIR');
  });

  it('as cópias de segurança podem conter dados já excluídos, e o texto diz isso sem afirmar que ficam no Brasil', () => {
    const delivered = allText(buildPrivacy(legalConfig, OFF));
    expect(delivered).toContain('podem conter dados que você já excluiu');
    expect(delivered).toContain('Cloudflare');
    expect(delivered.toLowerCase()).not.toMatch(
      /não saem do brasil|não há transferência internacional/,
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

const LOCAL_STORAGE_HEADING = '#### Armazenamento local (fora os cookies)';

/** As duas tabelas da seção "Cookies do site e armazenamento local" do CLAUDE.md, cada uma como texto. */
function claudeSections(): { cookies: string; localStorage: string } {
  const claude = readFileSync(join(process.cwd(), 'CLAUDE.md'), 'utf8');
  const start = claude.indexOf('### Cookies do site');
  const split = claude.indexOf(LOCAL_STORAGE_HEADING);
  const end = claude.indexOf('### Migrations');
  expect(start, 'seção "### Cookies do site…" do CLAUDE.md').toBeGreaterThanOrEqual(0);
  expect(split, `subseção "${LOCAL_STORAGE_HEADING}" do CLAUDE.md`).toBeGreaterThan(start);
  expect(end).toBeGreaterThan(split);
  return { cookies: claude.slice(start, split), localStorage: claude.slice(split, end) };
}

describe('lista de cookies', () => {
  it('está de acordo com a tabela "Cookies do site" do CLAUDE.md', () => {
    const section = claudeSections().cookies;
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

describe('lista do armazenamento local', () => {
  /** As linhas de dados da tabela: primeira coluna (o nome) e última (o "Existe"). */
  const rows = (): { name: string; exists: string }[] =>
    claudeSections()
      .localStorage.split('\n')
      .filter((line) => line.startsWith('| ') && !/^\|[-| ]+\|$/.test(line))
      .map((line) =>
        line
          .slice(1, -1)
          .split(/ \| /)
          .map((cell) => cell.trim()),
      )
      .filter((cells) => cells[0] !== 'Item')
      .map((cells) => ({ name: cells[0]!, exists: cells[cells.length - 1]! }));

  it('está de acordo com a tabela "Armazenamento local" do CLAUDE.md (nomes, ordem e "Existe")', () => {
    const documented = rows();
    expect(documented.length).toBeGreaterThanOrEqual(3);
    expect(LOCAL_STORAGE_ITEMS.map((item) => item.name)).toEqual(documented.map((r) => r.name));
    expect(
      LOCAL_STORAGE_ITEMS.map((item) => (item.only === 'turnstile' ? 'turnstile' : 'sempre')),
    ).toEqual(documented.map((r) => (r.exists.includes('Turnstile') ? 'turnstile' : 'sempre')));
  });

  it('o item do cartão de instalação usa a chave e o prazo de src/content/install.ts', () => {
    const item = LOCAL_STORAGE_ITEMS.find((i) => i.name.includes(INSTALL_RULES.storageKey))!;
    expect(item).toBeDefined();
    expect(item.purpose).toContain(`${INSTALL_RULES.dismissDays} dias`);
    expect(item.purpose).toContain('nunca é enviada ao servidor');
  });

  it('só o item do Turnstile depende da verificação anti-robô', () => {
    expect(LOCAL_STORAGE_ITEMS.filter((i) => i.only).map((i) => i.only)).toEqual(['turnstile']);
  });
});

describe('cartão de instalação: texto da política', () => {
  const privacy = allText(buildPrivacy(legalConfig, OFF));

  it('diz o que é guardado, onde, por quanto tempo e que nunca vai ao servidor', () => {
    expect(privacy).toContain(INSTALL_RULES.storageKey);
    for (const piece of [
      'iPhones e iPads',
      'Tela de Início',
      'em quantos dias diferentes você abriu o site',
      '"Agora não"',
      '"Já instalei"',
      `${INSTALL_RULES.dismissDays} dias`,
      'nunca é enviada ao servidor',
      'até o navegador limpar os dados do site',
      'o site não grava essa preferência',
    ]) {
      expect(privacy, piece).toContain(piece);
    }
  });

  it('o parágrafo fica na seção de cookies e armazenamento, também com os recursos ligados', () => {
    for (const features of [OFF, ON]) {
      const section = buildPrivacy(legalConfig, features).sections.find((s) => s.id === 'cookies')!;
      const text = allText({ title: '', lead: '', sections: [section] });
      expect(text).toContain(INSTALL_RULES.storageKey);
    }
  });
});

describe('gestão de membros pela administração (etapa 8f)', () => {
  const doc = buildPrivacy(legalConfig, OFF);
  const privacy = allText(doc);
  const section = (id: string) =>
    allText({ title: '', lead: '', sections: doc.sections.filter((s) => s.id === id) });

  it('diz que a administração vê e-mail e último acesso, para suporte e pedidos da LGPD, com registro', () => {
    for (const piece of [
      'a administração do clube pode ver o seu e-mail, a data do seu último acesso',
      'só para dar suporte e atender pedidos sobre os seus dados',
      'a consulta fica registrada',
    ]) {
      expect(section('dados'), piece).toContain(piece);
    }
  });

  it('não promete registro onde não há: a lista parcial e a busca por e-mail exato não são registradas', () => {
    const data = section('dados');
    expect(data).toContain('A lista de membros mostra só um e-mail parcial');
    expect(data).toContain('esses dois usos não ficam registrados');
    // O e-mail do primeiro item não diz mais que "não aparece para outras pessoas": a administração o vê.
    expect(data).not.toContain('Ele não aparece para outras pessoas');
    expect(data).toContain('a administração do clube o veem');
  });

  it('o Google só entra no texto da consulta de contato quando o login com Google está ativo', () => {
    const off = allText({
      title: '',
      lead: '',
      sections: buildPrivacy(legalConfig, OFF).sections.filter((s) => s.id === 'dados'),
    });
    const on = allText({
      title: '',
      lead: '',
      sections: buildPrivacy(legalConfig, { ...OFF, google: true }).sections.filter(
        (s) => s.id === 'dados',
      ),
    });
    expect(off).toContain('(código por e-mail), só para dar suporte');
    expect(off).not.toMatch(/Google/);
    expect(on).toContain('(código por e-mail ou Google), só para dar suporte');
  });

  it('diz que a administração pode suspender comentários e excluir contas', () => {
    expect(section('dados')).toContain('suspender a publicação de comentários de uma conta');
    expect(section('finalidades')).toContain('suspender os comentários dela ou excluí-la');
    expect(section('direitos')).toContain(
      'a administração confirma que o pedido vem do e-mail cadastrado',
    );
    expect(section('retencao')).toContain('a administração também pode excluir');
  });

  it('descreve a auditoria sem dado pessoal e deixa a retenção A DEFINIR, com o aviso de revisão', () => {
    expect(section('dados')).toContain('Registro das ações da administração (auditoria)');
    expect(section('dados')).toContain('não guarda nome, e-mail nem texto');
    expect(section('retencao')).toContain(
      'Por quanto tempo guardamos o registro das ações da administração: A DEFINIR',
    );
    expect(section('retencao')).toContain('ligadas só a esse identificador');
    // Preenchida, vira proposta e traz o aviso.
    const filled = allText(
      buildPrivacy({ ...legalConfig, audit: { retention: '12 meses.' } }, OFF),
    );
    expect(filled).toContain('12 meses.');
    expect(filled).toContain('Este ponto ainda precisa ser validado por um advogado.');
  });

  it('o selo público é "administração ou moderação", nunca "autora"', () => {
    expect(section('publico')).toContain('da administração ou da moderação');
    expect(privacy).not.toMatch(/\bautora\b|administradora|moderadora/i);
  });

  it('não promete nada que o código não faça (sem convite, mensagem, lote nem banimento com prazo)', () => {
    expect(privacy).not.toMatch(
      /convite por e-mail|mensagens aos membros|ações em lote|banimento/i,
    );
  });
});

describe('detecção dos pendentes na configuração entregue', () => {
  it('só a retenção da auditoria ficou A DEFINIR, além da revisão profissional', () => {
    expect(pendingFields(legalConfig).sort()).toEqual(['audit.retention']);
    expect(pendingItems(legalConfig).sort()).toEqual(['audit.retention', 'legalReviewed']);
  });

  it('a configuração de antes (tudo pendente) é detectada campo a campo', () => {
    expect(pendingFields(pending).sort()).toEqual(
      [
        'audit.retention',
        'backups.internationalTransfer',
        'backups.retention',
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

/* --- Correções de redação pedidas depois da revisão do código -------------------------------------------- */

const terms = () => allText(buildTerms(legalConfig));
const privacyOn = () => allText(buildPrivacy(legalConfig, ON));

describe('Google e Turnstile: texto condicional', () => {
  it('Google: a frase pedida só aparece com o login ativo, e o e-mail está entre os dados', () => {
    expect(privacyOn()).toContain(
      'Se você escolher entrar com o Google, ele nos informa seu nome, e-mail e foto de perfil.',
    );
    expect(privacyOn()).toContain('(ou que o Google informa, se você entrar com ele)');
    expect(allText(buildPrivacy(legalConfig, OFF))).not.toContain('ele nos informa seu nome');
  });

  it('Turnstile: a frase pedida só aparece com a verificação ativa', () => {
    expect(privacyOn()).toContain(
      'Quando a verificação anti-robô (Cloudflare Turnstile) estiver ativa, ela é usada na tela de entrada para confirmar que o envio vem de uma pessoa.',
    );
    expect(allText(buildPrivacy(legalConfig, OFF))).not.toContain(
      'verificação anti-robô (Cloudflare Turnstile)',
    );
  });

  it('internationalTransfer cita Supabase, Vercel e Resend e, "quando ativos", Turnstile e Google', () => {
    const text = legalConfig.internationalTransfer;
    expect(text).toContain(
      'os provedores que usamos (Supabase, Vercel e Resend) e, quando ativos, o Cloudflare Turnstile e o login do Google',
    );
    expect(text).toContain('podem ocorrer fora do Brasil');
    expect(text).not.toMatch(/n[ãa]o saem do brasil|n[ãa]o h[áa] transfer[êe]ncia internacional/i);
  });

  it('a tabela de serviços continua listando só o que está ativo', () => {
    const rows = (features: typeof OFF) =>
      buildPrivacy(legalConfig, features)
        .sections.find((section) => section.id === 'compartilhamento')!
        .blocks.flatMap((b) => (b.type === 'table' ? b.rows.map((r) => r[0]) : []));
    expect(rows(OFF)).toEqual(['Supabase', 'Vercel', 'Resend', 'Cloudflare R2']);
    expect(rows({ google: true, turnstile: false })).toEqual([
      'Supabase',
      'Vercel',
      'Resend',
      'Google',
      'Cloudflare R2',
    ]);
    expect(rows(ON)).toEqual([
      'Supabase',
      'Vercel',
      'Resend',
      'Google',
      'Cloudflare Turnstile',
      'Cloudflare R2',
    ]);
  });
});

describe('exclusão da conta: a equipe tem uma etapa a mais', () => {
  const STAFF =
    'Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe. Peça pelo e-mail de contato.';

  it('a frase pedida está na política (retenção e direitos) e nos termos', () => {
    expect(privacyOn().split(STAFF).length - 1).toBeGreaterThanOrEqual(1);
    expect(privacyOn()).toContain(
      'Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe.',
    );
    expect(terms()).toContain(STAFF);
  });

  it('nenhuma frase diz que a exclusão é imediata para todos', () => {
    // Nos textos das páginas nada diz que a exclusão é imediata ou "na hora": só o prazo de resposta cita isso,
    // e ele já traz a exceção da equipe.
    for (const text of [privacyOn().replace(legalConfig.requestDeadline, ''), terms()]) {
      expect(text).not.toMatch(/\bna hora\b|imediat/i);
    }
    // O prazo de resposta cita a exceção da equipe ao falar da exclusão "na hora".
    expect(legalConfig.requestDeadline).toContain(
      'as contas da equipe do clube têm uma etapa a mais para a exclusão',
    );
    expect(legalConfig.requestDeadline).toContain(
      'Respondemos aos pedidos em até 15 dias, contados do recebimento.',
    );
  });
});

describe('excluir comentário: política, termos e retenção dizem a mesma coisa', () => {
  const VISIBLE =
    'Você pode excluir seus comentários que estejam visíveis ou em análise, quando quiser';
  const MODERATED =
    'Comentários removidos pela moderação não aparecem mais no site, e o texto deles só deixa de existir quando a conta é excluída; se quiser que um deles seja apagado antes, peça pelo e-mail de contato.';

  it('política e termos usam as duas frases', () => {
    for (const text of [privacyOn(), terms()]) {
      expect(text).toContain(VISIBLE);
      expect(text).toContain(MODERATED);
    }
  });

  it('a retenção diz o mesmo dos comentários removidos pela moderação', () => {
    const item = (legalConfig.retention as readonly string[])[1]!;
    expect(item).toContain(
      'Comentários removidos pela moderação ficam guardados, sem exibição pública, até a exclusão da conta de quem os escreveu ou até você pedir, pelo e-mail de contato, que o texto seja apagado antes.',
    );
  });

  it('só promete o que o botão faz: no próprio comentário (Minha conta não tem exclusão de comentário)', () => {
    expect(privacyOn()).not.toMatch(/quando quiser, no próprio comentário ou em Minha conta/);
    expect(terms()).not.toMatch(/quando quiser, no próprio comentário ou em Minha conta/);
    expect(terms()).not.toContain('quando quiser, com "Excluir meu comentário"');
  });

  it('avisa que as respostas de outras pessoas somem da tela mas ficam guardadas', () => {
    expect(privacyOn()).toContain(
      'continuam guardadas até a exclusão da conta de quem as escreveu',
    );
  });
});

describe('finalidades: só o que o site pratica', () => {
  const purposes = () =>
    buildPrivacy(legalConfig, ON)
      .sections.find((section) => section.id === 'finalidades')!
      .blocks.flatMap((b) => (b.type === 'ul' ? [...b.items] : []));

  it('o e-mail serve para o código e para responder aos pedidos', () => {
    expect(purposes()[0]).toContain(
      'enviar o código de acesso por e-mail e responder aos pedidos que você nos fizer',
    );
    expect(privacyOn()).toContain(
      'Usamos para enviar o código de acesso por e-mail e responder aos pedidos que você nos fizer.',
    );
    expect(privacyOn()).not.toContain('falarmos com você sobre a sua conta');
  });

  it('nenhuma finalidade ou texto fala de e-mail de novas sessões, analytics, publicidade ou notificações', () => {
    const text = `${privacyOn()}\n${terms()}`.toLowerCase();
    for (const word of [
      'novas sessões',
      'newsletter',
      'inscritos',
      'push',
      'notificaç',
      'marketing',
      'perfil de consumo',
    ]) {
      expect(text, word).not.toContain(word);
    }
    // Só a negação existe: o site NÃO usa análise de audiência nem publicidade.
    expect(text).toContain('não usa ferramentas de análise de audiência nem de publicidade');
    expect(purposes().join(' ').toLowerCase()).not.toMatch(
      /an[áa]lise de audi|publicidade|novas sess/,
    );
  });
});

describe('idade mínima vem de legal-config', () => {
  const SENTENCE = (age: number) => ageSentence({ minimumAge: age });

  it('política e termos usam a mesma frase, com a idade da configuração (18) e a declaração', () => {
    expect(legalConfig.minimumAge).toBe(18);
    expect(privacyOn()).toContain(SENTENCE(legalConfig.minimumAge));
    expect(terms()).toContain(SENTENCE(legalConfig.minimumAge));
    expect(SENTENCE(18)).toContain('você declara ter essa idade');
    expect(SENTENCE(18)).toContain('O site não verifica a idade de quem cria a conta.');
  });

  it('mudar a idade na configuração muda os dois textos (o número não está escrito no texto)', () => {
    const other: LegalData = { ...legalConfig, minimumAge: 21 };
    expect(allText(buildPrivacy(other, ON))).toContain(SENTENCE(21));
    expect(allText(buildTerms(other))).toContain(SENTENCE(21));
    expect(allText(buildPrivacy(other, ON))).not.toContain(
      `${legalConfig.minimumAge} anos ou mais. Ao`,
    );
    expect(allText(buildTerms(other))).not.toContain(`${legalConfig.minimumAge} anos ou mais. Ao`);
  });

  it('nenhum texto legal fala em 16 anos (o advogado validou 16, o site exige 18)', () => {
    for (const text of [privacyOn(), terms(), allText(buildPrivacy(legalConfig, OFF))]) {
      expect(text).not.toMatch(/\b16 anos\b/);
    }
    expect(JSON.stringify(legalConfig)).not.toMatch(/\b16 anos\b/);
  });

  it('os arquivos de conteúdo não têm a idade escrita à mão (só a caixa do aceite, que lê a configuração)', () => {
    for (const file of ['privacy.ts', 'terms.ts', 'age.ts']) {
      const source = readFileSync(join(process.cwd(), 'src/content/legal', file), 'utf8');
      expect(source, file).not.toMatch(/\b1[0-9] anos\b/);
    }
  });
});

describe('regiões', () => {
  it('Supabase e Vercel: as frases pedidas, a partir de legal-config', () => {
    const text = privacyOn();
    expect(text).toContain(
      'O banco de dados e a autenticação (Supabase) ficam na região de São Paulo (Brasil).',
    );
    expect(text).toContain(
      'As funções do site (Vercel) rodam na região de São Paulo (gru1, Brasil), conforme a configuração do projeto no provedor.',
    );
    const other: LegalData = {
      ...legalConfig,
      regions: { ...legalConfig.regions, supabase: 'Virgínia (EUA)' },
    };
    expect(allText(buildPrivacy(other, ON))).toContain('ficam na região de Virgínia (EUA)');
  });

  it('o Resend tem região em legal-config (não ficou A DEFINIR)', () => {
    expect(legalConfig.regions.resend).not.toBe(A_DEFINIR);
    expect(pendingFields(legalConfig)).not.toContain('regions.resend');
  });

  it('continua proibido afirmar que os dados "não saem do Brasil"', () => {
    for (const text of [privacyOn(), terms(), JSON.stringify(legalConfig)]) {
      expect(text.toLowerCase()).not.toMatch(
        /n[ãa]o saem do brasil|n[ãa]o h[áa] transfer[êe]ncia internacional/,
      );
    }
  });
});

describe('o que ficou como estava (propostas a validar)', () => {
  it('base legal, garantia contratual dos provedores e prazo de 15 dias continuam e seguem como proposta', () => {
    expect((legalConfig.legalBases as readonly string[]).length).toBe(4);
    expect(legalConfig.internationalTransfer).toContain(
      'buscamos as garantias previstas na LGPD por meio dos contratos de tratamento de dados e dos termos desses provedores',
    );
    expect(legalConfig.requestDeadline).toContain('Respondemos aos pedidos em até 15 dias');
    expect(legalConfig.legalReviewed).toBe(false);
  });
});
