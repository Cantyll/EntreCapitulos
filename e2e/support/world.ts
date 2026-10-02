import { closeSync, openSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O "mundo" de dados dos testes. O app guarda a lista de livros e de sessões em cache por até 5
 * minutos (como em produção), então dado inserido por SQL DEPOIS da primeira visita ficaria
 * invisível. Por isso tudo o que os testes só leem é criado ANTES de o app receber a primeira
 * requisição, em `e2e/setup/world.ts` (globalSetup). Dado que o teste cria pelo próprio app
 * (comentários, painel) já invalida o cache direito.
 */
export const WORLD = {
  /** Livro com uma sessão de cada tipo, para os fluxos de visitante e de painel. */
  readingSlug: 'e2e-leitura',
  sessions: {
    public: { number: 1, from: 1, to: 3, title: 'Sessão pública de teste' },
    members: { number: 2, from: 4, to: 6, title: 'Só para quem entra' },
    draft: { number: 3, from: 7, to: 9, title: 'Rascunho secreto' },
    closed: { number: 4, from: 10, to: 12, title: 'Comentários fechados' },
  },
  /** Quantidade de livros do "pool": cada teste que comenta pega um livro só dele. */
  poolSize: 80,
} as const;

export const poolSlug = (slot: number) => `e2e-pool-${slot}`;
export const sessionPath = (slug: string, number: number) => `/livros/${slug}/sessoes/${number}`;

export const OPENING_TEXT = 'Texto de abertura da sessão.';
export const chapterText = (chapter: number) => `Texto do capítulo ${chapter} da sessão.`;
export const chapterTitle = (chapter: number) => `Título do capítulo ${chapter}`;

export const CLAIMS_DIR = join(__dirname, '..', '.tmp', 'claims');

/** Reserva um livro do pool (criação exclusiva de arquivo: atômica entre os processos de teste). */
export function claimPoolSlot(): { slug: string; sessionPath: string; sessionNumber: number } {
  for (let slot = 1; slot <= WORLD.poolSize; slot += 1) {
    try {
      closeSync(openSync(join(CLAIMS_DIR, String(slot)), 'wx'));
      const slug = poolSlug(slot);
      return { slug, sessionNumber: 1, sessionPath: sessionPath(slug, 1) };
    } catch {
      // já reservado por outro teste: tenta o próximo
    }
  }
  throw new Error('pool de livros de teste esgotado');
}
