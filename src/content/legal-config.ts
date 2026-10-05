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
 * Os campos marcados "// PROPOSTA: validar com advogado" foram preenchidos com propostas dos controladores:
 * valem como rascunho até um advogado validar. Enquanto isso `legalReviewed` continua `false`.
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
  /** Registro das ações da administração sobre pessoas (etapa 8f): só identificadores internos, cargos e o tipo da ação. */
  audit: {
    retention: string;
  };
};

/** Texto de um campo: uma frase ou uma lista de itens. */
export type LegalText = string | readonly string[];

export const legalConfig = {
  /** `true` só depois da revisão de um profissional. Padrão: `false`. */
  legalReviewed: false,

  /** Quem decide sobre o tratamento dos dados (controlador). */
  controllerName: 'Felipe Almeida e Agatha Montinelli',
  /** Contato para pedidos de privacidade (acesso, correção, exclusão…). */
  privacyContactEmail: 'Felipe.golinus@gmail.com',
  minimumAge: 16,
  /** Data da última atualização dos textos. */
  lastUpdated: '5 de outubro de 2026',

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

  // PROPOSTA: validar com advogado
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
  ],

  // PROPOSTA: validar com advogado
  requestDeadline:
    'Respondemos aos pedidos em até 15 dias, contados do recebimento. Acessar seus dados, corrigir seu nome e excluir sua conta você faz na hora, em "Minha conta"; as contas da equipe do clube têm uma etapa a mais para a exclusão (veja "Seus direitos").',

  /**
   * Cópias de segurança criptografadas do banco (etapa 8d): o dump é criptografado antes de sair do servidor de
   * automação e guardado num bucket privado do Cloudflare R2. Os dois campos abaixo dependem do advogado e
   * ficam A DEFINIR até lá; enquanto isso, as páginas legais seguem como rascunho.
   */
  backups: {
    internationalTransfer: A_DEFINIR,
    retention: A_DEFINIR,
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
 * Campos preenchidos com PROPOSTAS (cada um tem `// PROPOSTA: validar com advogado` no arquivo). Um teste confere
 * a lista contra os comentários, e o documento de revisão jurídica a usa.
 */
export const PROPOSAL_FIELDS = [
  'regions.cloudflareTurnstile',
  'regions.google',
  'regions.cloudflareR2',
  'legalBases',
  'internationalTransfer',
  'retention',
  'requestDeadline',
] as const;

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
