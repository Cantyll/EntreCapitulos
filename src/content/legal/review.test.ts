import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROPOSAL_FIELDS, legalConfig } from '../legal-config';
import { SITE_COOKIES } from './cookies';
import { buildPrivacy } from './privacy';
import { PROVIDERS } from './providers';
import {
  DATA_MAP,
  FUTURE_FEATURES,
  LAWYER_QUESTIONS,
  REVIEW_FEATURES,
  SECOND_ROUND_QUESTIONS,
  buildReviewDocument,
} from './review';
import { buildTerms } from './terms';

const FILE = join(process.cwd(), 'docs/revisao-juridica.md');
const generated = buildReviewDocument(legalConfig);

describe('docs/revisao-juridica.md (documento temporário para o advogado)', () => {
  it('está em dia com as fontes de src/content (regenere com UPDATE_LEGAL_REVIEW=1)', () => {
    if (process.env.UPDATE_LEGAL_REVIEW === '1') {
      mkdirSync(join(process.cwd(), 'docs'), { recursive: true });
      writeFileSync(FILE, generated);
    }
    // O documento é temporário: se alguém o apagar, não há o que comparar (e o teste não falha).
    if (!existsSync(FILE)) return;
    expect(
      readFileSync(FILE, 'utf8') === generated,
      'o arquivo ficou diferente das fontes: rode UPDATE_LEGAL_REVIEW=1 npx vitest run src/content/legal/review.test.ts',
    ).toBe(true);
  });

  it('tem as seções (a) a (h)', () => {
    for (const heading of [
      '## (a) O serviço e o controlador',
      '## (b) Mapa de dados',
      '## (c) Provedores e o papel de cada um',
      '## (d) Cookies e armazenamento local',
      '## (e) Texto integral',
      '## (f) Campos preenchidos como proposta e campos pendentes',
      '## (g) Funcionalidades futuras que mudam a política',
      '## (h) Perguntas para o advogado',
    ]) {
      expect(generated).toContain(heading);
    }
  });

  it('inclui o texto integral da política e dos termos, gerado pelas mesmas funções das páginas', () => {
    const privacy = buildPrivacy(legalConfig, REVIEW_FEATURES);
    const terms = buildTerms(legalConfig);
    for (const doc of [privacy, terms]) {
      expect(generated).toContain(`### ${doc.title}`);
      for (const section of doc.sections) expect(generated).toContain(`#### ${section.title}`);
    }
    expect(generated).toContain(legalConfig.privacyContactEmail);
    expect(generated).toContain(legalConfig.controllerName);
  });

  it('lista cada campo de proposta, os provedores e os cookies, vindos das fontes', () => {
    for (const field of PROPOSAL_FIELDS) expect(generated).toContain(`\`${field}\``);
    for (const provider of PROVIDERS) expect(generated).toContain(provider.name);
    for (const cookie of SITE_COOKIES)
      expect(generated).toContain(cookie.name.replace(/\|/g, '\\|'));
    for (const [id, region] of Object.entries(legalConfig.regions)) {
      expect(generated, id).toContain(region);
    }
    expect(generated).toContain(
      'Ainda "A DEFINIR":** `backups.internationalTransfer`, `backups.retention`, `audit.retention`',
    );
    expect(generated).toContain('(`legalReviewed`):** `false`');
  });

  it('cada fato leva a origem: do código, informado pelo dono do site ou não verificado', () => {
    for (const label of ['do código', 'informado pelo dono do site', 'não verificado']) {
      expect(generated).toContain(label);
    }
    // Toda linha do mapa de dados termina com uma das três origens.
    const mapRows = generated
      .split('\n')
      .filter((line) => DATA_MAP.some((item) => line.startsWith(`| ${item.data}`)));
    expect(mapRows).toHaveLength(DATA_MAP.length);
    for (const line of mapRows) {
      expect(line).toMatch(/\| (do código|informado pelo dono do site|não verificado) \|$/);
    }
  });

  it('as bases legais e a retenção do mapa apontam para itens que existem em legal-config', () => {
    const bases = legalConfig.legalBases as readonly string[];
    const retention = legalConfig.retention as readonly string[];
    for (const item of DATA_MAP) {
      if (item.basis !== null) expect(bases[item.basis - 1], item.data).toBeTruthy();
      if (item.retention !== null) expect(retention[item.retention - 1], item.data).toBeTruthy();
    }
    // Se alguém reordenar as listas de legal-config, o mapa precisa ser revisto.
    expect(retention[0]).toMatch(/^Conta e perfil/);
    expect(retention[1]).toMatch(/^Comentários/);
    expect(retention[2]).toMatch(/^Progresso de leitura/);
    expect(retention[3]).toMatch(/^Registros técnicos/);
    expect(retention[4]).toMatch(/^Pedidos de privacidade/);
    expect(retention[5]).toMatch(/^Cópias de segurança/);
    expect(bases[0]).toMatch(/^Criar e manter sua conta/);
    expect(bases[1]).toMatch(/^Exibir seu nome/);
    expect(bases[2]).toMatch(/^Moderar comentários/);
    expect(bases[3]).toMatch(/^Cumprir obrigações legais/);
  });

  it('as perguntas cobrem o que foi pedido', () => {
    const text = LAWYER_QUESTIONS.join('\n').toLowerCase();
    for (const topic of [
      'bases legais',
      'transferência internacional',
      'registros de acesso',
      'prazo de resposta',
      'encarregado (art. 41)',
      'art. 14',
      'controlador',
      'pequeno porte',
      'foro',
      'removidos pela moderação',
      'declaração de idade',
    ]) {
      expect(text, topic).toContain(topic);
    }
    const future = FUTURE_FEATURES.join('\n').toLowerCase();
    for (const topic of ['e-mail', 'reações', 'analytics', 'push']) expect(future).toContain(topic);
  });

  it('não afirma que os dados ficam só no Brasil', () => {
    expect(generated.toLowerCase()).not.toMatch(
      /n[ãa]o saem do brasil|n[ãa]o h[áa] transfer[êe]ncia internacional/,
    );
  });

  it('a seção (i) "Perguntas da segunda rodada" traz as seis perguntas sobre a gestão de membros', () => {
    expect(SECOND_ROUND_QUESTIONS).toHaveLength(6);
    expect(generated).toContain('## (i) Perguntas da segunda rodada');
    const section = generated.slice(generated.indexOf('## (i) Perguntas da segunda rodada'));
    SECOND_ROUND_QUESTIONS.forEach((question, index) => {
      expect(section).toContain(`${index + 1}. ${question}`);
    });
    for (const topic of [
      'Retenção da auditoria',
      'Identificadores de quem agiu e de quem sofreu a ação depois da exclusão',
      'A administração vendo e-mail e último acesso',
      'Suspensão de comentários',
      'Leitura de e-mail por função do projeto gerenciado',
    ]) {
      expect(section, topic).toContain(topic);
    }
    // A sexta, exatamente como pedida.
    expect(section).toContain(
      '6. As linhas de auditoria sobre a pessoa (mudança de cargo, suspensão, consulta ao e-mail pela administração) fazem parte do direito de acesso? Devem constar na exportação dela, com ou sem o nome de quem agiu?',
    );
    // A pergunta do rodapé do arquivo é a última seção: a (i) vem depois da (h).
    expect(generated.indexOf('## (h) Perguntas para o advogado')).toBeLessThan(
      generated.indexOf('## (i) Perguntas da segunda rodada'),
    );
  });

  it('o mapa de dados cobre o que a administração vê, a suspensão e a auditoria', () => {
    const names = DATA_MAP.map((item) => item.data);
    expect(names).toContain(
      'Consulta de e-mail, último acesso e provedor de login pela administração',
    );
    expect(names).toContain('Suspensão de comentários (quem está impedido de comentar)');
    expect(names).toContain('Auditoria das ações da administração sobre pessoas');
    expect(generated).toContain('Selo "Administração" ou "Moderação"'.replace('Selo', 'selo'));
    expect(generated).not.toMatch(/moderadora ou administradora|selo "Autora"/);
  });
});
