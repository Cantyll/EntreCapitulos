import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROPOSAL_FIELDS, VALIDATED_FIELDS, legalConfig } from '../legal-config';
import { SITE_COOKIES } from './cookies';
import { buildPrivacy } from './privacy';
import { PROVIDERS } from './providers';
import {
  DATA_MAP,
  FUTURE_FEATURES,
  LAWYER_QUESTIONS,
  REVIEW_FEATURES,
  SECOND_ROUND_QUESTIONS,
  THIRD_ROUND_QUESTIONS,
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

  it('tem as seções (a) a (j)', () => {
    for (const heading of [
      '## (a) O serviço e o controlador',
      '## (b) Mapa de dados',
      '## (c) Provedores e o papel de cada um',
      '## (d) Cookies e armazenamento local',
      '## (e) Texto integral',
      '## (f) Campos validados, campos de proposta e campos pendentes',
      '## (g) Funcionalidades futuras que mudam a política',
      '## (h) Perguntas para o advogado',
      '## (i) Perguntas da segunda rodada',
      '## (j) Perguntas da terceira rodada',
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
    for (const field of VALIDATED_FIELDS) expect(generated).toContain(`\`${field}\``);
    for (const provider of PROVIDERS) expect(generated).toContain(provider.name);
    for (const cookie of SITE_COOKIES)
      expect(generated).toContain(cookie.name.replace(/\|/g, '\\|'));
    for (const [id, region] of Object.entries(legalConfig.regions)) {
      expect(generated, id).toContain(region);
    }
    expect(generated).toContain('Ainda "A DEFINIR":** `audit.retention`');
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
    expect(retention[6]).toMatch(/^Aceite dos Termos/);
    expect(retention[7]).toMatch(/^Registro mínimo de exclusões/);
    expect(bases[0]).toMatch(/^Criar e manter sua conta/);
    expect(bases[1]).toMatch(/^Exibir seu nome/);
    expect(bases[2]).toMatch(/^Moderar comentários/);
    expect(bases[3]).toMatch(/^Cumprir obrigações legais/);
  });

  it('as perguntas da primeira rodada: saem só as respondidas e inalteradas (prazo e encarregado) e as que passaram para a terceira rodada', () => {
    const text = LAWYER_QUESTIONS.join('\n').toLowerCase();
    for (const topic of [
      'bases legais',
      'registros de acesso',
      'controlador',
      'pequeno porte',
      'foro',
      'removidos pela moderação',
    ]) {
      expect(text, topic).toContain(topic);
    }
    // Respondidas e inalteradas: o prazo de 15 dias e a dispensa do encarregado (validados pelo advogado).
    expect(text).not.toContain('prazo de resposta');
    expect(text).not.toContain('encarregado (art. 41)');
    // Continuam abertas e foram para a terceira rodada: idade, declaração de idade, transferência e registro de exclusões.
    for (const moved of [
      'art. 14',
      'declaração de idade no cadastro',
      'qual o mecanismo adequado para cada provedor',
      'registro mínimo de exclusões (proposta adiada',
    ]) {
      expect(text, moved).not.toContain(moved);
    }
    const future = FUTURE_FEATURES.join('\n').toLowerCase();
    for (const topic of [
      'e-mail',
      'reações',
      'analytics',
      'push',
      'censura',
      'verificação de idade',
    ]) {
      expect(future).toContain(topic);
    }
  });

  it('a seção (j) traz as perguntas da terceira rodada: ECA Digital, verificação de idade, censura, foro, art. 15 e as que passaram da primeira', () => {
    expect(THIRD_ROUND_QUESTIONS).toHaveLength(9);
    const section = generated.slice(generated.indexOf('## (j) Perguntas da terceira rodada'));
    THIRD_ROUND_QUESTIONS.forEach((question, index) => {
      expect(section).toContain(`${index + 1}. ${question}`);
    });
    for (const topic of [
      'ECA Digital (Lei 15.211/2025)',
      'Verificação de idade planejada',
      'Censura de palavras',
      'Foro e relação de consumo',
      'Art. 15 do Marco Civil',
      'confirmar que, sem CNPJ e sem fins econômicos, o art. 15 não se aplica',
      'Base legal do registro mínimo de exclusões',
      'Idade mínima de 18 anos',
      'Declaração de idade',
      'Transferência internacional',
    ]) {
      expect(section, topic).toContain(topic);
    }
    // A (h) vem antes da (i) e da (j).
    expect(generated.indexOf('## (i) Perguntas da segunda rodada')).toBeLessThan(
      generated.indexOf('## (j) Perguntas da terceira rodada'),
    );
  });

  it('cita as resoluções da ANPD só aqui: nº 19/2024 (transferência), nº 2/2022 e nº 18/2024 (encarregado)', () => {
    expect(generated).toContain('Resolução CD/ANPD nº 19/2024');
    expect(generated).toContain('Resolução CD/ANPD nº 2/2022');
    expect(generated).toContain('Resolução CD/ANPD nº 18/2024');
    // A nº 2/2022 está CONFIRMADA (informado pelo dono do site): sem "a confirmar".
    expect(generated).not.toMatch(/Resolução CD\/ANPD nº 2\/2022[^.\n]{0,30}a confirmar/);
    // A seção de provedores traz o mecanismo de transferência a confirmar, com a nº 19/2024.
    const providers = generated.slice(
      generated.indexOf('## (c) Provedores'),
      generated.indexOf('## (d) Cookies'),
    );
    expect(providers).toContain(
      'Transferência internacional: mecanismo a confirmar para cada provedor',
    );
    expect(providers).toContain('Resolução CD/ANPD nº 19/2024');
    // E os textos públicos (privacidade e termos) não citam número de resolução.
    for (const doc of [buildPrivacy(legalConfig, REVIEW_FEATURES), buildTerms(legalConfig)]) {
      expect(JSON.stringify(doc)).not.toMatch(/Resolu[çc][ãa]o CD\/ANPD|ANPD n[ºo]/);
    }
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
