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
  };
  legalBases: string;
  internationalTransfer: string;
  retention: string;
  /** Prazo para responder pedidos dos titulares (art. 18). */
  requestDeadline: string;
};

export const legalConfig = {
  /** `true` só depois da revisão de um profissional. Padrão: `false`. */
  legalReviewed: false,

  /** Quem decide sobre o tratamento dos dados (controlador). */
  controllerName: 'Felipe Almeida e Agatha Montinelli',
  /** Contato para pedidos de privacidade (acesso, correção, exclusão…). */
  privacyContactEmail: 'Felipe.golinus@gmail.com',
  minimumAge: 16,
  /** Data da última atualização dos textos. */
  lastUpdated: '2 de outubro de 2026',

  /** Região onde cada provedor roda a parte usada pelo site. */
  regions: {
    supabase: 'São Paulo (Brasil)',
    vercel: 'São Paulo (gru1, Brasil)',
    resend: 'São Paulo (sa-east-1)',
    // Serviços globais: a região não é informada.
    cloudflareTurnstile: A_DEFINIR,
    google: A_DEFINIR,
  },

  /** Dependem de análise jurídica. */
  legalBases: A_DEFINIR,
  internationalTransfer: A_DEFINIR,
  retention: A_DEFINIR,
  requestDeadline: A_DEFINIR,
} as const satisfies LegalData;

export type LegalConfig = {
  readonly legalReviewed: boolean;
  readonly [key: string]: unknown;
};

/** Texto que o site mostra no lugar de um valor ainda não decidido. */
export const PENDING_LABEL = A_DEFINIR;

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
