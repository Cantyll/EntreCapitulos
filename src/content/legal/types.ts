/*
 * Modelo dos textos legais: uma lista de seções com blocos simples (parágrafo, lista, tabela, destaque).
 * O renderizador (`LegalDocument`) transforma isto em elementos React e destaca "A DEFINIR".
 */

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: readonly string[] }
  | { type: 'note'; text: string }
  | {
      type: 'table';
      caption: string;
      head: readonly string[];
      rows: readonly (readonly string[])[];
    };

export type LegalSection = {
  id: string;
  title: string;
  blocks: readonly LegalBlock[];
};

export type LegalDoc = {
  title: string;
  lead: string;
  sections: readonly LegalSection[];
};

/** Funcionalidades que mudam o que o texto precisa listar (ambas dependem de variáveis `NEXT_PUBLIC_*`). */
export type LegalFeatures = {
  /** "Continuar com Google" está ligado. */
  google: boolean;
  /** O Cloudflare Turnstile está ligado no envio do código. */
  turnstile: boolean;
};
