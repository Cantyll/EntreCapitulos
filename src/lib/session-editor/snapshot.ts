import type { BodyDoc } from '@/lib/session-body';

/*
 * O que o editor sabe salvar. É uma LISTA FIXA: o servidor só aceita estes campos (nunca status,
 * published_at, book_id, number nem id vindos do cliente).
 *
 * `updatedAt` (o "token" de concorrência) é TEXTO OPACO: nunca vira `Date`, porque o Postgres guarda
 * microssegundos e o JavaScript só tem milissegundos. A comparação é sempre igualdade de texto.
 */
export type Visibility = 'public' | 'members';

export type SessionSnapshot = {
  title: string;
  body: BodyDoc;
  chapterFrom: number;
  chapterTo: number;
  visibility: Visibility;
  commentsOpen: boolean;
  /** Nota de 0 a 5 em passos de 0,5; `null` = sem nota. */
  rating: number | null;
  /** Vazio = resumo automático. */
  excerpt: string;
};

export const SNAPSHOT_KEYS = [
  'title',
  'body',
  'chapterFrom',
  'chapterTo',
  'visibility',
  'commentsOpen',
  'rating',
  'excerpt',
] as const satisfies readonly (keyof SessionSnapshot)[];

/**
 * JSON com as chaves em ordem alfabética, em todos os níveis. O Postgres (jsonb) devolve as chaves
 * de um objeto em outra ordem que o editor as emite, então a comparação precisa ignorar a ordem.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Comparação por valor: campos na ordem da lista fixa, objetos com as chaves ordenadas. */
export function snapshotKey(snapshot: SessionSnapshot): string {
  return stableStringify(SNAPSHOT_KEYS.map((key) => snapshot[key]));
}

export function snapshotsEqual(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return a === b || snapshotKey(a) === snapshotKey(b);
}

/** Uma versão que está no servidor: o conteúdo e o `updated_at` como texto opaco. */
export type ServerVersion = { updatedAt: string; snapshot: SessionSnapshot };

/** Igualdade do token: texto contra texto. Nunca passa por Date. */
export function sameToken(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && a === b;
}
