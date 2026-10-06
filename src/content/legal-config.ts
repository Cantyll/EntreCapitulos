/*
 * Configuração dos textos legais (política de privacidade e termos de uso, etapa 7b).
 *
 * É O ÚNICO LUGAR onde esses dados vivem. O que ainda não foi informado ou decidido fica como
 * "A DEFINIR": os textos mostram o marcador, e o teste `legal-config.test.ts` lista os pendentes
 * (sem falhar o CI).
 *
 * Os textos legais são RASCUNHO para revisão de um profissional. Enquanto `legalReviewed` for `false`
 * (ou houver qualquer campo A DEFINIR), as páginas mostram "Rascunho em revisão" e ficam com noindex.
 * Preencher os campos NÃO remove o aviso: só mudar `legalReviewed` para `true`, depois da revisão.
 *
 * Cada campo preenchido está em uma de duas situações (etapa 8g):
 *  - "// VALIDADO pelo advogado": o advogado validou o texto (informado pelo dono do site). Está em `VALIDATED_FIELDS`
 *    e a política não repete o aviso "ainda precisa ser validado" nesse ponto.
 *  - "// PROPOSTA: validar com advogado": proposta dos controladores, ainda sem validação. Está em `PROPOSAL_FIELDS`
 *    e a política mostra o aviso por ponto enquanto `legalReviewed` for `false`.
 * Um teste confere as duas listas contra os comentários deste arquivo.
 *
 * Não escreva aqui (nem nos textos) que os dados "não saem do Brasil": os provedores são empresas
 * internacionais, e a rede de entrega, os registros e o suporte podem envolver outros países. Descreva
 * a região onde o banco e as funções rodam e deixe a análise para o profissional.
 */

export const A_DEFINIR = 'A DEFINIR';

/** Forma dos dados dos textos legais. Os builders de `src/content/legal/` recebem isto (e os testes passam variações). */
export type LegalData = {
  legalReviewed: boolean;
  controllerName: string;
  privacyContactEmail: string;
  /** Idade mínima: uma DECLARAÇÃO da pessoa no aceite dos Termos. O site não a verifica. */
  minimumAge: number;
  lastUpdated: string;
  regions: {
    supabase: string;
    vercel: string;
    resend: string;
    cloudflareTurnstile: string;
    google: string;
    /** Cloudflare R2: cópias de segurança criptografadas do banco (etapa 8d). */
    cloudflareR2: string;
  };
  /** Uma frase única ou uma lista (um item por finalidade). */
  legalBases: LegalText;
  internationalTransfer: string;
  /** Uma frase única ou uma lista (um item por tipo de dado). */
  retention: LegalText;
  /** Prazo para responder pedidos dos titulares (art. 18). */
  requestDeadline: string;
  /** Cópias de segurança criptografadas do banco, guardadas no Cloudflare R2 (etapa 8d). */
  backups: {
    internationalTransfer: string;
    retention: string;
  };
  /** Encarregado (art. 41): a dispensa como agente de tratamento de pequeno porte (o canal é o e-mail de contato). */
  dataProtectionOfficer: string;
  /** Registro mínimo de exclusões (etapa 8g): só um identificador técnico e a data, guardados por 56 dias. */
  deletionRegistry: {
    legalBasis: string;
  };
  /** Registro das ações da administração sobre pessoas (etapa 8f): só identificadores internos, cargos e o tipo da ação. */
  audit: {
    retention: string;
  };
};

/** Texto de um campo: uma frase ou uma lista de itens. */
export type LegalText = string | readonly string[];

/** A idade mínima (uma declaração da pessoa). Os textos de `retention` a repetem a partir daqui. */
const MINIMUM_AGE = 18;

export const legalConfig = {
  /** `true` só depois da revisão de um profissional. Padrão: `false`. */
  legalReviewed: false,

  /** Quem decide sobre o tratamento dos dados (controlador). */
  controllerName: 'Felipe Almeida e Agatha Montinelli',
  /** Contato para pedidos de privacidade (acesso, correção, exclusão…). */
  privacyContactEmail: 'Felipe.golinus@gmail.com',
  /**
   * Idade mínima declarada no aceite dos Termos: 18 anos, por causa da ECA Digital (Lei 15.211/2025). O advogado
   * validou 16; os 18 são decisão do dono do site e ainda dependem da posição dele sobre a ECA Digital.
   */
  // PROPOSTA: validar com advogado
  minimumAge: MINIMUM_AGE,
  /** Data da última atualização dos textos. */
  lastUpdated: '6 de outubro de 2026',

  /** Região onde cada provedor roda a parte usada pelo site. */
  regions: {
    supabase: 'São Paulo (Brasil)',
    vercel: 'São Paulo (gru1, Brasil)',
    resend: 'São Paulo (sa-east-1)',
    // PROPOSTA: validar com advogado
    cloudflareTurnstile:
      'Rede global da Cloudflare, sem região fixa. O processamento pode ocorrer fora do Brasil.',
    // PROPOSTA: validar com advogado
    google:
      'Infraestrutura global do Google, sem região fixa. O processamento pode ocorrer fora do Brasil.',
    // PROPOSTA: validar com advogado
    cloudflareR2:
      'Região escolhida na criação do bucket, fora do Brasil (a Cloudflare não oferece região no Brasil para o R2, a confirmar). O armazenamento e o processamento ocorrem fora do Brasil.',
  },

  // VALIDADO pelo advogado (informado pelo dono do site)
  legalBases: [
    'Criar e manter sua conta, enviar o código de acesso por e-mail e, se você escolher entrar com o Google, receber seu nome, e-mail e foto de perfil: execução de contrato (art. 7º, V, da LGPD), porque são necessários para oferecer o serviço que você pediu.',
    'Exibir seu nome e seus comentários e guardar seu progresso de leitura: execução de contrato (art. 7º, V).',
    'Moderar comentários e proteger a comunidade e o serviço contra abuso, incluindo limites de uso e verificação anti-robô: legítimo interesse (art. 7º, IX), respeitando seus direitos e suas expectativas.',
    'Cumprir obrigações legais e exercer direitos em eventual disputa: cumprimento de obrigação legal ou regulatória (art. 7º, II) e exercício regular de direitos (art. 7º, VI).',
  ],

  // PROPOSTA: validar com advogado
  internationalTransfer:
    'O banco de dados e as funções do site rodam em servidores em São Paulo (Brasil). Mesmo assim, os provedores que usamos (Supabase, Vercel e Resend) e, quando ativos, o Cloudflare Turnstile e o login do Google são empresas com operações em outros países, e partes do tratamento, como a entrega de e-mails, a proteção contra robôs, a rede de distribuição de conteúdo, os registros técnicos e o suporte, podem ocorrer fora do Brasil. Nesses casos, buscamos as garantias previstas na LGPD por meio dos contratos de tratamento de dados e dos termos desses provedores. Você pode pedir informações sobre isso pelo e-mail de contato.',

  // PROPOSTA: validar com advogado
  retention: [
    'Conta e perfil (e-mail e nome de exibição): enquanto a conta existir. Ao excluir a conta em "Minha conta", esses dados são apagados; a administração também pode excluir uma conta (por abuso ou a pedido da pessoa), com o mesmo efeito.',
    'Comentários: enquanto a conta existir ou até você excluir o comentário. Ao excluir, o texto é substituído por um aviso e o original deixa de ser guardado. Comentários removidos pela moderação ficam guardados, sem exibição pública, até a exclusão da conta de quem os escreveu ou até você pedir, pelo e-mail de contato, que o texto seja apagado antes.',
    'Progresso de leitura: enquanto a conta existir. Para quem não tem conta, por até 1 ano no próprio navegador (cookie).',
    'Registros técnicos e de segurança: mantidos pelos provedores por períodos definidos por eles, em regra curtos, e pelo prazo que a lei exigir.',
    'Pedidos de privacidade enviados por e-mail: pelo tempo necessário para atender e comprovar o atendimento.',
    'Cópias de segurança: as mantidas pelo provedor do banco de dados e as cópias criptografadas que guardamos no Cloudflare R2 podem conter os dados por um período limitado depois da exclusão, até a cópia expirar.',
    `Aceite dos Termos (a versão aceita, a data do primeiro aceite e a do último, que valem também como a declaração de ter ${MINIMUM_AGE} anos ou mais): enquanto a conta existir. Ao excluir a conta, o aceite é apagado.`,
    'Registro mínimo de exclusões (identificador técnico da conta e data da exclusão): 56 dias, o mesmo prazo das cópias de segurança semanais, e depois é apagado.',
  ],

  // VALIDADO pelo advogado (informado pelo dono do site)
  requestDeadline:
    'Respondemos aos pedidos em até 15 dias, contados do recebimento. Acessar seus dados, corrigir seu nome e excluir sua conta você faz na hora, em "Minha conta"; as contas da equipe do clube têm uma etapa a mais para a exclusão (veja "Seus direitos").',

  /**
   * Cópias de segurança criptografadas do banco (etapa 8d): o dump é criptografado antes de sair do servidor de
   * automação e guardado num bucket privado do Cloudflare R2. A retenção (14 dias as diárias, 56 as semanais) foi
   * validada pelo advogado; os números vêm de `.github/backup.config.json` e um teste confere. A transferência
   * internacional ainda é proposta: a frase "buscamos as garantias da LGPD pelos termos de tratamento de dados da
   * Cloudflare" só é verdadeira depois que o dono do site aceitar o DPA da Cloudflare (docs/lancamento.md).
   */
  backups: {
    // PROPOSTA: validar com advogado
    internationalTransfer:
      'Ficam no Cloudflare R2, fora do Brasil. A criptografia é feita antes do envio e a Cloudflare não tem a chave. Buscamos as garantias da LGPD pelos termos de tratamento de dados da Cloudflare.',
    // VALIDADO pelo advogado (informado pelo dono do site)
    retention:
      'As cópias criptografadas no Cloudflare R2 são mantidas por 14 dias (as diárias) e 56 dias (as semanais) e depois descartadas. Até lá podem conter dados que você já excluiu. Se o provedor do banco de dados mantiver cópias próprias, elas seguem o prazo dele.',
  },

  /**
   * Encarregado (art. 41 da LGPD): o clube é tratado como agente de tratamento de pequeno porte e fica dispensado de
   * indicar um encarregado; o canal para os titulares é o e-mail de contato (`privacyContactEmail`). A política
   * não cita número de resolução: as da ANPD ficam só em `docs/revisao-juridica.md`.
   */
  // VALIDADO pelo advogado (informado pelo dono do site)
  dataProtectionOfficer:
    'O Entre Capítulos é tratado como agente de tratamento de pequeno porte e, na forma da regulamentação da ANPD para esses agentes, fica dispensado de indicar um encarregado pelo tratamento de dados pessoais.',

  /**
   * Registro mínimo de exclusões (etapa 8g, `account_deletions`): identificador técnico e data, 56 dias, para que
   * contas e dados já excluídos não sejam recriados ao restaurar uma cópia de segurança. A base é uma proposta.
   */
  // PROPOSTA: validar com advogado
  deletionRegistry: {
    legalBasis:
      'Cumprimento de obrigação legal ou regulatória (art. 7º, II, da LGPD): manter um registro mínimo (só um identificador técnico e a data) para que contas e dados já excluídos por você não sejam recriados ao restaurar uma cópia de segurança.',
  },

  /**
   * Auditoria das ações da administração (etapa 8f): mudança de cargo, suspensão, consulta de e-mail, cópia dos
   * dados e exclusão de conta. O registro guarda só os identificadores internos (uuid) de quem agiu e de quem
   * sofreu a ação, o tipo da ação e a data; nunca nome, e-mail nem texto. O prazo depende do advogado.
   */
  audit: {
    retention: A_DEFINIR,
  },
} as const satisfies LegalData;

export type LegalConfig = {
  readonly legalReviewed: boolean;
  readonly [key: string]: unknown;
};

/**
 * Campos preenchidos com PROPOSTAS (cada um tem `// PROPOSTA: validar com advogado` no arquivo): a política mostra o
 * aviso "ainda precisa ser validado" nesses pontos. Um teste confere a lista contra os comentários, e o documento
 * de revisão jurídica a usa. `retention` continua aqui: o advogado validou só a retenção das cópias
 * (`backups.retention`), não a lista inteira.
 */
export const PROPOSAL_FIELDS = [
  'minimumAge',
  'regions.cloudflareTurnstile',
  'regions.google',
  'regions.cloudflareR2',
  'internationalTransfer',
  'retention',
  'backups.internationalTransfer',
  'deletionRegistry',
] as const;

/**
 * Campos que o advogado VALIDOU (informado pelo dono do site; cada um tem `// VALIDADO pelo advogado` no arquivo):
 * a política não repete o aviso nesses pontos. Não tira o selo "Rascunho em revisão": só `legalReviewed` faz isso.
 */
export const VALIDATED_FIELDS = [
  'legalBases',
  'requestDeadline',
  'dataProtectionOfficer',
  'backups.retention',
] as const;

export type ProposalField = (typeof PROPOSAL_FIELDS)[number];

/** Texto que o site mostra no lugar de um valor ainda não decidido. */
export const PENDING_LABEL = A_DEFINIR;

/**
 * Tudo o que ainda falta para as páginas legais deixarem de ser rascunho: os campos A DEFINIR e a revisão
 * profissional (`legalReviewed`). É a lista que o teste mostra no CI.
 */
export function pendingItems(config: LegalConfig = legalConfig): string[] {
  return [...pendingFields(config), ...(config.legalReviewed ? [] : ['legalReviewed'])];
}

/** Caminhos (`regions.google`) de todos os campos ainda marcados A DEFINIR. */
export function pendingFields(value: unknown, prefix = ''): string[] {
  if (value === A_DEFINIR) return [prefix];
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    pendingFields(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/** As páginas legais são rascunho enquanto faltar campo ou a revisão profissional. */
export function isLegalDraft(config: LegalConfig = legalConfig): boolean {
  return !config.legalReviewed || pendingFields(config).length > 0;
}
