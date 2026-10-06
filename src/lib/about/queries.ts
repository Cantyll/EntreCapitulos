import 'server-only';

import { unstable_cache } from 'next/cache';

import { logFailure } from '@/lib/auth/log';
import { createPublicClient } from '@/lib/public/client';
import { SITE_SOBRE_TAG } from '@/lib/public/tags';

import { defaultAbout } from './defaults';
import { isAboutUnavailable } from './errors';
import { parseAbout, type AboutContent } from './schema';

/*
 * A página Sobre PÚBLICA: lê o conteúdo publicado com o cliente SEM cookies, dentro de `unstable_cache` com a tag
 * `site:sobre` (a Server Action de publicar e restaurar a expira com `updateTag`; 5 minutos de rede de segurança).
 * Visitante, membro e moderação só enxergam o publicado pelo RLS: o rascunho nunca passa por aqui.
 *
 * O site NUNCA quebra por causa disto: sem nada publicado, com a migration ainda não aplicada, com a leitura falhando
 * ou com um conteúdo que não passa na validação, `/sobre` mostra o conteúdo padrão de `src/content/sobre.ts`. Só a
 * falha que não é "tabela ausente" é registrada, e só pelo código (nunca o conteúdo).
 */

const SAFETY_NET_SECONDS = 300;

export type PublishedAbout =
  | { source: 'published'; content: AboutContent; publishedAt: string }
  | { source: 'default'; content: AboutContent; publishedAt: null };

/** O erro que se registra quando o conteúdo publicado não passa na validação: só o motivo, nunca o conteúdo. */
class InvalidPublishedAbout extends Error {
  readonly code: string;
  constructor(issue: string) {
    super('invalid_published_about');
    this.name = 'InvalidPublishedAbout';
    this.code = issue;
  }
}

/** A linha publicada (ou `null`). Erros do banco são lançados: o `unstable_cache` não guarda exceção. */
const readPublishedRow = unstable_cache(
  async (): Promise<{ content: unknown; publishedAt: string } | null> => {
    const { data, error } = await createPublicClient()
      .from('site_pages')
      .select('content, published_at')
      .eq('slug', 'sobre')
      .maybeSingle();
    if (error) throw error;
    return data ? { content: data.content, publishedAt: data.published_at } : null;
  },
  ['public:site-sobre'],
  { tags: [SITE_SOBRE_TAG], revalidate: SAFETY_NET_SECONDS },
);

const fallback = (): PublishedAbout => ({
  source: 'default',
  content: defaultAbout(),
  publishedAt: null,
});

export async function getPublishedAbout(): Promise<PublishedAbout> {
  let row: Awaited<ReturnType<typeof readPublishedRow>>;
  try {
    row = await readPublishedRow();
  } catch (error) {
    if (!isAboutUnavailable(error as { code?: unknown })) logFailure('sobre.leitura', error);
    return fallback();
  }
  if (!row) return fallback();
  const parsed = parseAbout(row.content);
  if (!parsed.ok) {
    const failure = new InvalidPublishedAbout(parsed.issue);
    logFailure('sobre.conteudo', failure);
    return fallback();
  }
  return { source: 'published', content: parsed.content, publishedAt: row.publishedAt };
}
