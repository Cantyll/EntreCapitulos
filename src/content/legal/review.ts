import { ROLE_LABELS } from '../../lib/auth/roles';
import { INSTALL_RULES } from '../install';
import { PROPOSAL_FIELDS, VALIDATED_FIELDS, pendingFields, type LegalData } from '../legal-config';
import { LOCAL_STORAGE_ITEMS, SITE_COOKIES } from './cookies';
import { buildPrivacy } from './privacy';
import { FACT_SOURCE_LABEL, PROVIDERS, type FactSource } from './providers';
import { buildTerms } from './terms';
import type { LegalBlock, LegalDoc, LegalFeatures } from './types';

/*
 * Documento de revisão jurídica (`docs/revisao-juridica.md`): um arquivo temporário para entregar a um advogado.
 * É GERADO por `buildReviewDocument` a partir das mesmas fontes de `src/content` (configuração, textos,
 * provedores e cookies); o teste `review.test.ts` falha se o arquivo ficar diferente do que esta função produz.
 *
 * Para regenerar: `UPDATE_LEGAL_REVIEW=1 npx vitest run src/content/legal/review.test.ts`.
 */

/** Resoluções da ANPD citadas SÓ neste documento (os textos públicos não citam número de resolução). */
export const TRANSFER_RESOLUTION = 'Resolução CD/ANPD nº 19/2024';
export const SMALL_AGENT_RESOLUTION = 'Resolução CD/ANPD nº 2/2022';
export const DPO_RESOLUTION = 'Resolução CD/ANPD nº 18/2024';

/** O que cada campo validado cobre (para o advogado reconhecer o que ele validou). */
const VALIDATED_NOTES: Record<(typeof VALIDATED_FIELDS)[number], string> = {
  legalBases: ': as bases legais de cada finalidade.',
  requestDeadline: ': prazo de 15 dias para responder aos pedidos dos titulares.',
  dataProtectionOfficer: `: a dispensa do encarregado como agente de tratamento de pequeno porte, com o e-mail de contato como canal (referências: ${SMALL_AGENT_RESOLUTION}, sobre os agentes de pequeno porte, e ${DPO_RESOLUTION}, sobre o encarregado).`,
  'backups.retention':
    ': retenção das cópias de segurança, 14 dias (diárias) e 56 dias (semanais).',
};

/** Para o advogado ler tudo: o texto integral é o de quando o Google e o Turnstile estão ativos. */
export const REVIEW_FEATURES: LegalFeatures = { google: true, turnstile: true };

const tag = (source: FactSource): string => FACT_SOURCE_LABEL[source];

/** Uma linha de tabela em Markdown: `|` e quebras de linha escapados. */
const cell = (value: string): string => value.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const row = (cells: readonly string[]): string => `| ${cells.map(cell).join(' | ')} |`;
function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  return [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
}

function blockToMarkdown(block: LegalBlock): string {
  switch (block.type) {
    case 'p':
      return block.text;
    case 'note':
      return `> ${block.text}`;
    case 'ul':
      return block.items.map((item) => `- ${item}`).join('\n');
    case 'table':
      return `*${block.caption}*\n\n${table(block.head, block.rows)}`;
  }
}

/** O texto integral de uma página legal, com títulos um nível abaixo do documento. */
export function docToMarkdown(doc: LegalDoc): string {
  return [
    `### ${doc.title}`,
    `*${doc.lead}*`,
    ...doc.sections.flatMap((section) => [
      `#### ${section.title}`,
      ...section.blocks.map(blockToMarkdown),
    ]),
  ].join('\n\n');
}

// --- (b) Mapa de dados ------------------------------------------------------------------------------------

/** Qual item de `legalBases` e de `retention` (1 a N) se aplica, e se o dado só existe com uma funcionalidade. */
type DataRow = {
  data: string;
  where: string;
  purpose: string;
  /** Item de `legalBases` (1-based), ou `null` quando é para o advogado definir. */
  basis: number | null;
  /** Item de `retention` (1-based), ou `null` quando não há item. */
  retention: number | null;
  sees: string;
  source: FactSource;
  only?: keyof LegalFeatures;
};

export const DATA_MAP: readonly DataRow[] = [
  {
    data: 'E-mail',
    where: 'Supabase Auth (tabela `auth.users`)',
    purpose: 'Entrar na conta, enviar o código de acesso e responder pedidos',
    basis: 1,
    retention: 1,
    sees: 'A própria pessoa, quem administra o Supabase e, sob demanda e com registro, a administração do clube (ver a linha da consulta de e-mail, abaixo). Não é público.',
    source: 'codigo',
  },
  {
    data: 'Nome de exibição',
    where: 'Supabase (tabela `profiles`)',
    purpose: 'Mostrar quem comentou',
    basis: 2,
    retention: 1,
    sees: 'Qualquer visitante (público).',
    source: 'codigo',
  },
  {
    data: 'Nome, e-mail e foto vindos do Google',
    where: 'Supabase (nome inicial e endereço da foto em `profiles`; e-mail em `auth.users`)',
    purpose: 'Criar a conta de quem escolhe entrar com o Google',
    basis: 1,
    retention: 1,
    sees: 'O nome é público. O endereço da foto é legível publicamente pela API (a interface mostra só as iniciais). O e-mail não é público.',
    source: 'codigo',
    only: 'google',
  },
  {
    data: `Papel (${ROLE_LABELS.member.toLowerCase()}, ${ROLE_LABELS.moderator.toLowerCase()} ou ${ROLE_LABELS.admin.toLowerCase()})`,
    where: 'Supabase (`profiles.role`)',
    purpose: 'Distinguir a equipe e liberar a moderação',
    basis: 3,
    retention: 1,
    sees: `Qualquer visitante (aparece como selo "${ROLE_LABELS.admin}" ou "${ROLE_LABELS.moderator}").`,
    source: 'codigo',
  },
  {
    data: 'Comentários e respostas (texto, data, estado de moderação)',
    where: 'Supabase (tabela `comments`)',
    purpose: 'Exibir e moderar a conversa',
    basis: 2,
    retention: 2,
    sees: 'Aprovados: qualquer visitante (ou só membros, em sessão "só para membros"). Em análise: o autor e a equipe. Removidos: o autor e a equipe.',
    source: 'codigo',
  },
  {
    data: 'Capítulo lido (no momento do comentário) e aviso de spoiler',
    where: 'Supabase (`comments.read_up_to` e `comments.spoiler_up_to`)',
    purpose: 'Mostrar até onde a pessoa tinha lido e cobrir spoiler',
    basis: 2,
    retention: 2,
    sees: 'Qualquer visitante, junto do comentário.',
    source: 'codigo',
  },
  {
    data: 'Alerta interno "Contém link"',
    where: 'Supabase (tabela `comment_flags`)',
    purpose: 'Ajudar a moderação a analisar comentários com link',
    basis: 3,
    retention: 2,
    sees: 'Só a equipe.',
    source: 'codigo',
  },
  {
    data: 'Progresso de leitura (com conta)',
    where: 'Supabase (tabela `reading_progress`)',
    purpose: 'Guardar até que capítulo a pessoa leu e esconder spoilers',
    basis: 2,
    retention: 3,
    sees: 'Só a própria pessoa.',
    source: 'codigo',
  },
  {
    data: 'Progresso de leitura (sem conta)',
    where: 'Cookie `ec_progress` no navegador',
    purpose: 'O mesmo, para quem não tem conta',
    basis: 2,
    retention: 3,
    sees: 'Só o navegador da pessoa (o servidor lê o cookie para esconder os spoilers).',
    source: 'codigo',
  },
  {
    data: 'Sessão de login',
    where: 'Cookies `sb-…-auth-token` e as tabelas de sessão do Supabase Auth',
    purpose: 'Manter a pessoa conectada',
    basis: 1,
    retention: 1,
    sees: 'A própria pessoa e quem administra o Supabase.',
    source: 'codigo',
  },
  {
    data: 'Consulta de e-mail, último acesso e provedor de login pela administração',
    where: 'Supabase Auth (`auth.users`), lido por funções do banco que só a administração chama',
    purpose: 'Dar suporte e atender pedidos sobre os dados (LGPD)',
    basis: 3,
    retention: 1,
    sees: 'Só a administração. O e-mail completo, o último acesso e o provedor só aparecem depois de um clique no perfil, e cada vez que aparecem fica na auditoria. A lista de membros mostra só o e-mail mascarado (primeira letra e domínio) e a busca por e-mail exato confirma se existe uma conta com ele: esses dois usos NÃO ficam na auditoria.',
    source: 'codigo',
  },
  {
    data: 'Suspensão de comentários (quem está impedido de comentar)',
    where: 'Supabase (tabela `member_suspensions`, separada de `profiles`, que é pública)',
    purpose: 'Impedir que uma conta publique comentários (abuso)',
    basis: 3,
    retention: 1,
    sees: 'A própria pessoa e a administração.',
    source: 'codigo',
  },
  {
    data: 'Auditoria das ações da administração sobre pessoas',
    where: 'Supabase (tabela `member_audit`; só funções do banco gravam)',
    purpose:
      'Registrar quem mudou um cargo, suspendeu ou reativou comentários, consultou o e-mail, baixou os dados ou excluiu uma conta',
    basis: 3,
    retention: null,
    sees: 'Só a administração. Guarda só identificadores internos (uuid) de quem agiu e de quem sofreu a ação, o tipo da ação, a data e, na mudança de cargo, o cargo de antes e o de depois. Nunca nome, e-mail nem texto. Continua depois da exclusão da conta (ver `audit.retention`).',
    source: 'codigo',
  },
  {
    data: 'Aceite dos Termos e declaração de ter 18 anos ou mais (versão, data do primeiro aceite e do último)',
    where: 'Supabase (tabela `terms_acceptances`; só a função `accept_terms` grava)',
    purpose:
      'Registrar o aceite dos Termos e da Política e a declaração de idade (a idade é declarada, nunca verificada)',
    basis: 4,
    retention: 7,
    sees: 'A própria pessoa (em "Baixar meus dados") e a administração (no arquivo de dados da pessoa, ao atender um pedido, com registro na auditoria). Guarda só o último aceite e a data do primeiro, sem histórico.',
    source: 'codigo',
  },
  {
    data: 'Registro mínimo de exclusões (identificador técnico da conta excluída e data)',
    where:
      'Supabase (tabela `account_deletions`; só funções do banco gravam e leem; nenhum acesso pela API, nem da administração)',
    purpose:
      'Evitar que contas e dados já excluídos sejam recriados por engano ao restaurar uma cópia de segurança',
    basis: 4,
    retention: 8,
    sees: 'Ninguém pelo site nem pela API: só quem administra o Supabase, no banco. Entra nas cópias de segurança como as outras tabelas. Sem nome, e-mail nem texto.',
    source: 'codigo',
  },
  {
    data: 'Registros técnicos de acesso (IP, data e hora, navegador, páginas)',
    where: 'Registros dos provedores (Vercel, Supabase e outros)',
    purpose: 'Operar e proteger o serviço',
    basis: 3,
    retention: 4,
    sees: 'Os provedores e quem administra as contas deles.',
    // O site não coleta nem grava isso: são registros que os próprios provedores podem manter.
    source: 'nao-verificado',
  },
  {
    data: 'Verificação anti-robô (dados do navegador enviados à Cloudflare)',
    where: 'Cloudflare Turnstile (o site não guarda estes dados)',
    purpose: 'Confirmar que o pedido de código vem de uma pessoa',
    basis: 3,
    retention: null,
    sees: 'A Cloudflare.',
    source: 'nao-verificado',
    only: 'turnstile',
  },
  {
    data: 'Pedidos de privacidade enviados por e-mail',
    where: 'Caixa de e-mail dos controladores',
    purpose: 'Atender os pedidos e comprovar o atendimento',
    basis: 4,
    retention: 5,
    sees: 'Os controladores.',
    source: 'informado',
  },
  {
    data: 'Cópias de segurança do banco de dados',
    where: 'Provedor do banco de dados (Supabase)',
    purpose: 'Continuidade do serviço',
    basis: null,
    retention: 6,
    sees: 'O provedor.',
    source: 'nao-verificado',
  },
  {
    data: 'Cópias de segurança criptografadas do banco (incluem dados pessoais)',
    where: 'Cloudflare R2 (bucket privado, fora do Brasil)',
    purpose: 'Recuperar o site depois de uma perda de dados',
    basis: null,
    retention: 6,
    sees: 'Quem tiver o acesso ao bucket e a frase-senha da criptografia (os controladores).',
    source: 'informado',
  },
  {
    data: 'Cópia local do rascunho (editor de sessões)',
    where: 'IndexedDB do navegador da equipe',
    purpose: 'Não perder o texto se o aplicativo for fechado',
    basis: null,
    retention: null,
    sees: 'Só quem usa o editor (a equipe).',
    source: 'codigo',
  },
  {
    data: 'Preferência do cartão de instalação (neste aparelho)',
    where: `localStorage do navegador (\`${INSTALL_RULES.storageKey}\`), só em iPhone e iPad (Safari ou navegador embutido de outro aplicativo); nunca é enviada ao servidor`,
    purpose:
      'Decidir quando mostrar o cartão que ensina a colocar o site na Tela de Início: dias distintos de visita, último dia, "Agora não" (e quando) e "Já instalei"',
    basis: null,
    retention: null,
    sees: 'Só a própria pessoa (fica no aparelho).',
    source: 'codigo',
  },
];

/** Texto curto de um item de `legalBases`: só as referências à LGPD. */
function basisLabel(config: LegalData, item: number | null): string {
  if (item === null) return 'a definir pelo advogado';
  const list = Array.isArray(config.legalBases) ? config.legalBases : [config.legalBases];
  const text = list[item - 1];
  if (!text) return 'a definir pelo advogado';
  const refs = text.match(/\(art\. [^)]+\)/g);
  return `item ${item} da lista de bases${refs ? `: ${refs.join(' e ')}` : ''}`;
}

function retentionLabel(config: LegalData, item: number | null): string {
  if (item === null) return 'sem item específico (a definir pelo advogado)';
  const list = Array.isArray(config.retention) ? config.retention : [config.retention];
  return list[item - 1] ?? 'sem item específico (a definir pelo advogado)';
}

// --- (g) e (h) ---------------------------------------------------------------------------------------------

/** Funcionalidades futuras (Fases 2 e 3 do projeto) que mudariam a política. Nenhuma existe hoje. */
export const FUTURE_FEATURES: readonly string[] = [
  'Envio por e-mail de cada nova sessão aos inscritos (Resend; tabela de inscritos): novo dado (e-mail para newsletter), nova finalidade e base legal, descadastro.',
  'Reações, curtidas e votação do próximo livro: novos dados de comportamento ligados à conta.',
  'Ferramenta de análise de audiência (analytics) ou estatísticas do painel: hoje o site não usa nenhuma.',
  'Notificações push (Web Push): permissão do navegador e identificadores do aparelho.',
  'Service worker e leitura offline: cópias do conteúdo guardadas no aparelho.',
  'Denúncias de comentários e de membros: novos dados.',
  'Convites por e-mail, mensagens aos membros, ações em lote, banimento com prazo, anotações da administração sobre pessoas e cargos personalizados (a gestão de membros de hoje não faz nada disso): cada um mudaria o que a política diz.',
  'Edição de comentário pelo autor: hoje o banco não deixa mudar o texto.',
  'Busca no site.',
  'Motor de censura de palavras (etapa 8h, NÃO implementada): ocultaria palavras inadequadas a menores de 18 anos em todo o conteúdo dinâmico para quem não tem a idade verificada, inclusive visitantes.',
  'Verificação de idade opcional (etapa 8i, NÃO implementada e bloqueada pelo parecer do advogado): CPF e data de nascimento, conferidos à mão só pela administração, criptografados, apagados na decisão e fora das cópias de segurança.',
];

/** As perguntas para o advogado. */
export const LAWYER_QUESTIONS: readonly string[] = [
  'Bases legais: as quatro propostas (execução de contrato, legítimo interesse, obrigação legal e exercício regular de direitos) servem para cada finalidade? O legítimo interesse (moderação, limites de uso e verificação anti-robô) exige registro da avaliação?',
  'Retenção e guarda de registros de acesso: quais prazos e quais registros precisamos guardar ou podemos descartar, inclusive os que os provedores mantêm, e o que dizer sobre as cópias de segurança?',
  'Quem é o controlador: os dois donos do site em conjunto, uma pessoa, ou uma empresa? Isso muda o texto e a responsabilidade?',
  'Regime de agentes de tratamento de pequeno porte: o site se enquadra, e isso dispensa ou simplifica alguma obrigação?',
  'Termos de Uso: responsabilidade pelo conteúdo dos comentários, limitação de responsabilidade e foro.',
  'Retenção de comentários removidos pela moderação: guardar o texto original até a exclusão da conta é adequado, e qual a melhor forma de atender o pedido de apagar antes?',
  'Cópias de segurança (Cloudflare R2): qual a base legal e o mecanismo de transferência internacional para guardar um dump criptografado fora do Brasil, e como conciliar o direito de exclusão com dados que continuam nas cópias até expirarem? (A retenção de 14 dias para as diárias e 56 dias para as semanais já foi validada.)',
  'Contas da equipe: a exclusão só depois de retirar o papel de equipe, a pedido por e-mail, está de acordo com os direitos do titular?',
];

/**
 * Perguntas da segunda rodada (etapa 8f, gestão de membros pela administração): o que a administração passou a
 * poder fazer e registrar sobre as pessoas. Ficam num grupo à parte para o advogado responder em separado.
 */
export const SECOND_ROUND_QUESTIONS: readonly string[] = [
  'Retenção da auditoria: por quanto tempo guardar as linhas de auditoria das ações da administração sobre pessoas (`audit.retention`, hoje "A DEFINIR")? O que justifica o prazo e como ele se concilia com a eliminação de dados quando a conta é excluída?',
  'Identificadores de quem agiu e de quem sofreu a ação depois da exclusão: as linhas de auditoria sobre uma conta excluída (e as em que ela foi quem fez a ação) continuam ligadas só ao identificador interno (uuid), sem nome, e-mail nem texto. Esse identificador ainda é dado pessoal? Ele também aparece nas cópias de segurança, nos registros da Vercel (`/painel/membros/<uuid>`) e nos 8 primeiros caracteres do nome do arquivo de dados. Precisa ser tratado na política e nos prazos?',
  'A administração vendo e-mail e último acesso: a administração vê o e-mail completo, o último acesso e o provedor de login de qualquer pessoa, para suporte e pedidos da LGPD, depois de um clique e com registro de cada vez que são mostrados. Já a lista de membros mostra o e-mail mascarado (primeira letra e domínio) e a busca por e-mail exato confirma se existe uma conta com ele, e esses dois usos NÃO são registrados. Qual a base legal adequada, o texto da política basta, esses dois usos sem registro são aceitáveis ou devem ser auditados, e é preciso limitar quem tem o cargo de administração ou registrar a finalidade de cada consulta?',
  'Suspensão de comentários: a administração pode suspender os comentários de uma conta, sem motivo, prazo nem aviso além da mensagem no campo de comentário. Isso é uma sanção que exige aviso prévio, motivo, prazo ou canal de contestação? Precisa constar nos Termos de Uso?',
  'Leitura de e-mail por função do projeto gerenciado: o e-mail é lido da tabela de contas do Supabase (provedor gerenciado) por funções do banco, executadas com o papel dono das funções, e o uso é registrado só pelo nosso próprio registro. Isso muda o papel do Supabase como operador, ou exige alguma cláusula ou aviso? E como descrever o caso em que o projeto gerenciado não permite essa leitura?',
  'As linhas de auditoria sobre a pessoa (mudança de cargo, suspensão, consulta ao e-mail pela administração) fazem parte do direito de acesso? Devem constar na exportação dela, com ou sem o nome de quem agiu?',
];

/**
 * Perguntas da terceira rodada (etapa 8g, adequações legais): idade mínima de 18 anos, declaração de idade no aceite,
 * registro mínimo de exclusões, foro e as duas funcionalidades planejadas e NÃO implementadas (8h e 8i). Inclui as
 * perguntas abertas da primeira rodada que mudaram de forma (idade, declaração de idade, transferência
 * internacional e registro de exclusões).
 */
export const THIRD_ROUND_QUESTIONS: readonly string[] = [
  'ECA Digital (Lei 15.211/2025): a lei se aplica ao clube, que é um blog e clube de leitura com comentários, sem fins econômicos e sem CNPJ? O que ela exige de nós e o que muda se se aplica? A decisão atual do dono do site é exigir 18 anos ou mais.',
  'Verificação de idade planejada (opcional, NÃO implementada): a pessoa informaria o CPF e a data de nascimento; só a administração (nunca a moderação, e ninguém valida o próprio pedido) os conferiria à mão; os dados seriam criptografados na aplicação, apagados na decisão (aprovar ou recusar), expirariam em 30 dias se pendentes e ficariam fora das cópias de segurança, restando só o resultado da decisão, a data e quem decidiu. Isso atende como mecanismo confiável de verificação? Qual a base legal e a retenção adequadas para o CPF? (Limite conhecido: a conferência manual mostra que o CPF e a data existem e coincidem, não que quem enviou é o titular.)',
  'Censura de palavras para quem não verificou a idade (NÃO implementada): ocultar palavras inadequadas a menores de 18 anos em todo o conteúdo dinâmico, para qualquer pessoa sem a idade verificada, inclusive visitantes, é uma medida de mitigação aceitável?',
  'Foro e relação de consumo: a cláusula que elege o foro da Comarca de Sinop/MT vale diante de uma relação de consumo, em que o consumidor pode propor a ação no próprio domicílio? Precisa de ressalva ou de outra redação?',
  'Art. 15 do Marco Civil da Internet (guarda de registros de acesso por 6 meses): confirmar que, sem CNPJ e sem fins econômicos, o art. 15 não se aplica. Hoje o site não guarda IP por conta própria (só os provedores guardam registros técnicos, no prazo deles). Quando houver CNPJ ou fins econômicos, o ponto será reavaliado com o advogado.',
  'Base legal do registro mínimo de exclusões e do aceite dos Termos: o registro mínimo (identificador técnico e data, por 56 dias) está descrito como "cumprimento de obrigação legal" (art. 7º, II); essa é a base adequada, ou seria o legítimo interesse (art. 7º, IX)? E o aceite dos Termos, que guarda só a última versão aceita, a data do último aceite e a do primeiro (sem histórico), basta como prova do aceite e da declaração de idade?',
  'Idade mínima de 18 anos: o advogado validou 16, e a mudança para 18 é decisão do dono do site por causa da ECA Digital. O texto atual basta? O que muda se uma conta de menor for identificada (art. 14 da LGPD)?',
  'Declaração de idade: a caixa obrigatória no primeiro acesso (e ao aceitar uma nova versão), sem verificação, basta como declaração? Ela precisa de algum registro além da versão e das datas do aceite?',
  `Transferência internacional: confirmar, para cada provedor (Supabase, Vercel, Resend, Cloudflare, tanto o Turnstile quanto o R2, e Google), se o mecanismo é a ${TRANSFER_RESOLUTION} (cláusulas-padrão contratuais) e se o texto "buscamos as garantias previstas na LGPD por meio dos contratos e dos termos de tratamento de dados dos provedores" é verdadeiro e suficiente depois que o dono do site aceitar o termo de tratamento de dados (DPA) de cada um.`,
];

// --- O documento -------------------------------------------------------------------------------------------

export function buildReviewDocument(config: LegalData): string {
  const features = REVIEW_FEATURES;
  const pending = pendingFields(config);
  const featureLabel = (feature?: keyof LegalFeatures): string =>
    feature === 'google'
      ? 'só com o login do Google ativo'
      : feature === 'turnstile'
        ? 'só com o Turnstile ativo'
        : 'sempre';

  const parts: string[] = [];

  parts.push(
    [
      '# Revisão jurídica: Entre Capítulos',
      '',
      '> **Documento TEMPORÁRIO**, para entregar ao advogado. Pode ser apagado depois da revisão (ver o README). É **gerado** a partir de `src/content/` (`legal-config.ts`, `legal/privacy.ts`, `legal/terms.ts`, `legal/providers.ts` e `legal/cookies.ts`) por `UPDATE_LEGAL_REVIEW=1 npx vitest run src/content/legal/review.test.ts`; um teste falha se ele ficar diferente das fontes. Não edite à mão.',
      '',
      `Última atualização dos textos: ${config.lastUpdated}. Os textos são **RASCUNHO** (\`legalReviewed\` = \`${config.legalReviewed}\`).`,
      '',
      'Cada fato abaixo vem marcado com a origem: **' +
        (Object.values(FACT_SOURCE_LABEL) as string[]).join('**, **') +
        '**.',
    ].join('\n'),
  );

  parts.push(
    [
      '## (a) O serviço e o controlador',
      '',
      '1. O Entre Capítulos é um blog e clube de leitura de Agatha Montinelli: ela publica "sessões de leitura" (relatos por grupo de capítulos) do livro atual (' +
        tag('codigo') +
        ').',
      '2. Quem entra no clube comenta cada sessão, com controle de spoiler por capítulo; os comentários são moderados (' +
        tag('codigo') +
        ').',
      '3. É um site web (sem aplicativo nativo), hospedado na Vercel, com banco de dados e login no Supabase e e-mail de código enviado pelo Resend (' +
        tag('codigo') +
        ' e ' +
        tag('informado') +
        ').',
      '4. Para entrar há login por código de 6 dígitos enviado por e-mail e, se ativado, login com o Google; sem ferramentas de análise ou de publicidade (' +
        tag('codigo') +
        ').',
      `5. **Controlador:** ${config.controllerName} (${tag('informado')}). Contato para pedidos de privacidade: ${config.privacyContactEmail} (${tag('informado')}). Idade mínima: ${config.minimumAge} anos, declarada pela pessoa no aceite dos Termos, **sem** verificação de idade (${tag('codigo')}); é decisão do dono do site (o advogado validou 16) e fica como proposta até a posição sobre a ECA Digital.`,
    ].join('\n'),
  );

  parts.push(
    [
      '## (b) Mapa de dados',
      '',
      'A base legal e a retenção de cada linha apontam para os itens de `legalBases` e `retention` de `legal-config.ts` (propostas a validar).',
      '',
      table(
        [
          'Dado',
          'Onde é guardado',
          'Finalidade',
          'Base legal proposta',
          'Retenção proposta',
          'Quem vê',
          'Existe',
          'Origem do fato',
        ],
        DATA_MAP.map((item) => [
          item.data,
          item.where,
          item.purpose,
          basisLabel(config, item.basis),
          retentionLabel(config, item.retention),
          item.sees,
          featureLabel(item.only),
          tag(item.source),
        ]),
      ),
    ].join('\n'),
  );

  parts.push(
    [
      '## (c) Provedores e o papel de cada um',
      '',
      'A região é a informada pelos donos do site e **não foi verificada no código** (não há `vercel.json`; a região das funções é uma configuração do painel da Vercel). Fora a região, o que cada serviço faz vem do código.',
      '',
      table(
        ['Serviço', 'Papel (LGPD)', 'Para quê', 'Região (legal-config)', 'Existe', 'Origem'],
        PROVIDERS.map((provider) => [
          provider.name,
          provider.role,
          provider.purpose,
          config.regions[provider.id],
          featureLabel(provider.feature),
          `uso: ${tag(provider.usedBy)}; região: ${tag('informado')}`,
        ]),
      ),
      '',
      '### Transferência internacional: mecanismo a confirmar para cada provedor',
      '',
      `A referência adotada pelo dono do site é a **${TRANSFER_RESOLUTION}** (cláusulas-padrão contratuais). Para **cada** provedor da tabela acima (Supabase, Vercel, Resend, Cloudflare, tanto o Turnstile quanto o R2, e Google), o advogado confirma se esse é o mecanismo adequado e se o contrato do provedor o cumpre (${tag('nao-verificado')}). Os textos públicos dizem apenas que buscamos as garantias previstas na LGPD pelos contratos e pelos termos de tratamento de dados dos provedores, e **não citam resolução**. Essa frase só é verdadeira depois que o dono do site aceitar o termo de tratamento de dados (DPA) de cada provedor (\`docs/lancamento.md\`).`,
    ].join('\n'),
  );

  parts.push(
    [
      '## (d) Cookies e armazenamento local',
      '',
      table(
        ['Nome', 'Finalidade', 'Duração', 'Existe', 'Origem'],
        [
          ...SITE_COOKIES.map((cookie) => [
            cookie.name,
            cookie.purpose,
            cookie.duration,
            cookie.only === 'google' ? 'só com o login do Google ativo' : 'sempre',
            tag('codigo'),
          ]),
          ...LOCAL_STORAGE_ITEMS.map((item) => [
            item.name,
            `${item.purpose} (${item.who})`,
            item.duration,
            item.only === 'turnstile' ? 'só com o Turnstile ativo' : 'sempre',
            item.only === 'turnstile'
              ? `${tag('nao-verificado')} (medido só com a chave de testes da Cloudflare)`
              : tag('codigo'),
          ]),
        ],
      ),
      '',
      'Todos os cookies são essenciais; não há banner de consentimento (' + tag('codigo') + ').',
    ].join('\n'),
  );

  parts.push(
    [
      '## (e) Texto integral',
      '',
      'Os dois textos abaixo são os de `/privacidade` e `/termos`, com o login do Google e o Turnstile **ativos** (com eles desligados, a tabela de serviços, os cookies e alguns itens da lista de dados somem).',
      '',
      docToMarkdown(buildPrivacy(config, features)),
      '',
      docToMarkdown(buildTerms(config)),
    ].join('\n'),
  );

  parts.push(
    [
      '## (f) Campos validados, campos de proposta e campos pendentes',
      '',
      'Cada campo preenchido de `src/content/legal-config.ts` tem um destes comentários: `// VALIDADO pelo advogado` (informado pelo dono do site) ou `// PROPOSTA: validar com advogado`. A política só mostra o aviso "ainda precisa ser validado" nos pontos de proposta.',
      '',
      '**Validados pelo advogado (' + VALIDATED_FIELDS.length + '):**',
      '',
      ...VALIDATED_FIELDS.map((field) => `- \`${field}\`${VALIDATED_NOTES[field]}`),
      '',
      '**Preenchidos como proposta (' + PROPOSAL_FIELDS.length + '):**',
      '',
      ...PROPOSAL_FIELDS.map((field) => `- \`${field}\``),
      '',
      '**Ainda "A DEFINIR":** ' +
        (pending.length === 0 ? 'nenhum campo.' : pending.map((f) => `\`${f}\``).join(', ')),
      '',
      `**Revisão profissional (\`legalReviewed\`):** \`${config.legalReviewed}\`. Enquanto for \`false\`, as páginas mostram "Rascunho em revisão" e ficam com \`noindex\`.`,
    ].join('\n'),
  );

  parts.push(
    [
      '## (g) Funcionalidades futuras que mudam a política',
      '',
      'Nenhuma destas existe hoje (' + tag('codigo') + ').',
      '',
      ...FUTURE_FEATURES.map((item) => `- ${item}`),
    ].join('\n'),
  );

  parts.push(
    [
      '## (h) Perguntas para o advogado',
      '',
      ...LAWYER_QUESTIONS.map((question, index) => `${index + 1}. ${question}`),
    ].join('\n'),
  );

  parts.push(
    [
      '## (i) Perguntas da segunda rodada',
      '',
      'Sobre a gestão de membros pela administração (etapa 8f): o que a administração passou a poder ver, fazer e registrar sobre as pessoas. O texto de `/privacidade` já descreve esses pontos; o prazo de retenção da auditoria (`audit.retention`) está "A DEFINIR".',
      '',
      ...SECOND_ROUND_QUESTIONS.map((question, index) => `${index + 1}. ${question}`),
    ].join('\n'),
  );

  parts.push(
    [
      '## (j) Perguntas da terceira rodada',
      '',
      'Sobre as adequações legais (etapa 8g): a idade mínima de 18 anos (decisão do dono do site; o advogado validou 16), o aceite dos Termos com a declaração de idade, o registro mínimo de exclusões, o foro e as duas funcionalidades planejadas e **não implementadas** (a censura de palavras e a verificação de idade). Reúne também as perguntas abertas da primeira rodada que mudaram de forma.',
      '',
      ...THIRD_ROUND_QUESTIONS.map((question, index) => `${index + 1}. ${question}`),
    ].join('\n'),
  );

  return `${parts.join('\n\n')}\n`;
}
