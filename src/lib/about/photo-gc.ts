import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logFailure } from '@/lib/auth/log';
import { COVER_BUCKET } from '@/lib/books/cover-path';
import type { Database } from '@/lib/supabase/database.types';

import { SITE_PHOTO_FOLDER, SITE_PHOTO_INCOMING_FOLDER, isSitePhotoPath } from './urls';

/*
 * Varredura das fotos da página Sobre no Storage. Uma foto só é apagada quando NADA a referencia (nem o rascunho, nem
 * o publicado, nem uma das 20 versões do histórico: restaurar uma versão precisa da foto dela) E ela já é velha o
 * bastante para não ser um envio em andamento (uma foto enviada e ainda não salva no rascunho não é referenciada por
 * ninguém). Os originais enviados pelo navegador (`site/sobre/incoming/`, com os metadados) são apagados logo que o
 * servidor os processa; os que sobram (a finalização nunca chegou) saem aqui, com um prazo mais curto.
 *
 * FALHA FECHADA: se qualquer leitura das referências falhar, NADA é apagado. A varredura nunca falha a ação que a
 * chamou (só registra o erro) e nunca apaga mais de `MAX_DELETIONS` arquivos de uma vez.
 */

export const PHOTO_MIN_AGE_MS = 60 * 60 * 1000;
export const INCOMING_MIN_AGE_MS = 15 * 60 * 1000;
export const MAX_DELETIONS = 100;

export type StoredFile = { name: string; createdAt: string | null };

/** Núcleo puro: quais caminhos apagar. Data ilegível ou no futuro vale "novo demais": não apaga. */
export function selectStalePhotos(input: {
  finals: readonly StoredFile[];
  incoming: readonly StoredFile[];
  referenced: ReadonlySet<string>;
  now: number;
}): string[] {
  const old = (file: StoredFile, minAge: number): boolean => {
    const created = file.createdAt ? Date.parse(file.createdAt) : Number.NaN;
    return Number.isFinite(created) && input.now - created >= minAge;
  };
  const stale: string[] = [];
  for (const file of input.finals) {
    const path = `${SITE_PHOTO_FOLDER}/${file.name}`;
    // Só os arquivos com o nome que o servidor gera: qualquer outro nome fica como está.
    if (!isSitePhotoPath(path)) continue;
    if (input.referenced.has(path)) continue;
    if (old(file, PHOTO_MIN_AGE_MS)) stale.push(path);
  }
  for (const file of input.incoming) {
    if (old(file, INCOMING_MIN_AGE_MS)) stale.push(`${SITE_PHOTO_INCOMING_FOLDER}/${file.name}`);
  }
  return stale;
}

type Client = Pick<SupabaseClient<Database>, 'from' | 'storage'>;

type PathRow = { path: string | null };

/** Todo caminho de foto referenciado pelo rascunho, pelo publicado e pelo histórico. `null` se alguma leitura falhar. */
async function referencedPhotos(supabase: Client): Promise<Set<string> | null> {
  const queries = [
    supabase.from('site_page_drafts').select('path:content->photo->>path'),
    supabase.from('site_pages').select('path:content->photo->>path'),
    supabase.from('site_page_revisions').select('path:content->photo->>path').limit(200),
  ];
  const referenced = new Set<string>();
  for (const query of queries) {
    const { data, error } = await query;
    if (error) {
      logFailure('about.photo.referencias', error);
      return null;
    }
    for (const row of (data ?? []) as unknown as PathRow[]) {
      if (typeof row.path === 'string') referenced.add(row.path);
    }
  }
  return referenced;
}

async function listFolder(supabase: Client, folder: string): Promise<StoredFile[] | null> {
  const { data, error } = await supabase.storage.from(COVER_BUCKET).list(folder, { limit: 1000 });
  if (error) {
    logFailure('about.photo.listar', error);
    return null;
  }
  // Pastas vêm sem `id`; só os arquivos interessam.
  return (data ?? [])
    .filter((entry) => entry.id)
    .map((entry) => ({ name: entry.name, createdAt: entry.created_at ?? null }));
}

/** Apaga as fotos sem referência e velhas. Nunca lança. Devolve quantos arquivos apagou. */
export async function sweepAboutPhotos(
  supabase: Client,
  now: number = Date.now(),
): Promise<number> {
  try {
    const referenced = await referencedPhotos(supabase);
    if (!referenced) return 0;
    const [finals, incoming] = await Promise.all([
      listFolder(supabase, SITE_PHOTO_FOLDER),
      listFolder(supabase, SITE_PHOTO_INCOMING_FOLDER),
    ]);
    if (!finals || !incoming) return 0;
    const stale = selectStalePhotos({ finals, incoming, referenced, now }).slice(0, MAX_DELETIONS);
    if (stale.length === 0) return 0;
    const { error } = await supabase.storage.from(COVER_BUCKET).remove(stale);
    if (error) {
      logFailure('about.photo.apagar', error);
      return 0;
    }
    return stale.length;
  } catch (error) {
    logFailure('about.photo.varredura', error);
    return 0;
  }
}
