'use server';

import { revalidatePath } from 'next/cache';

import { finalizeAboutPhotoWith, type FinalizePhotoResult } from '@/lib/about/finalize-photo';
import { sweepAboutPhotos } from '@/lib/about/photo-gc';
import {
  parseToken,
  publishAbout,
  restoreAboutRevision,
  saveAboutDraft,
  type AboutPublishOutcome,
  type AboutRestoreOutcome,
  type AboutSaveOutcome,
} from '@/lib/about/service';
import { aboutErrorMessage } from '@/lib/about/errors';
import { requireRole } from '@/lib/auth/session';
import { invalidateSiteSobre } from '@/lib/public/tags';
import { createClient } from '@/lib/supabase/server';

/*
 * Server Actions da página Sobre. TODAS começam com `requireRole('admin')` (o teste-guarda confere uma chamada por
 * action; a moderação recebe 403) e o RLS e as funções do banco conferem de novo. O cliente só manda o CONTEÚDO (o
 * servidor valida tudo com o zod e o banco confere de novo) e o token de concorrência: status, autoria, datas e
 * versões nunca vêm dele. Salvar o rascunho e finalizar a foto não mudam nada PÚBLICO (o rascunho nunca é lido por
 * visitante), então não expiram o cache do site; publicar e restaurar expiram a tag `site:sobre` e a rota `/sobre`.
 */

const badInput: { kind: 'error'; message: string } = {
  kind: 'error',
  message: aboutErrorMessage(null),
};

/** Fotos órfãs e antigas (sem nenhuma referência) saem do Storage depois de uma ação que as pode ter soltado. */
async function sweepPhotos() {
  const supabase = await createClient();
  await sweepAboutPhotos(supabase);
}

export async function saveAboutDraftAction(input: {
  content: unknown;
  expectedUpdatedAt: string | null;
}): Promise<AboutSaveOutcome> {
  await requireRole('admin');
  const token = parseToken(input?.expectedUpdatedAt);
  if (!token.ok) return badInput;

  const supabase = await createClient();
  const outcome = await saveAboutDraft(supabase, {
    content: input.content,
    expectedUpdatedAt: token.token,
  });
  if (outcome.kind === 'saved') await sweepPhotos();
  return outcome;
}

export async function publishAboutAction(input: {
  content: unknown;
  expectedUpdatedAt: string | null;
}): Promise<AboutPublishOutcome> {
  await requireRole('admin');
  const token = parseToken(input?.expectedUpdatedAt);
  if (!token.ok) return badInput;

  const supabase = await createClient();
  const outcome = await publishAbout(supabase, {
    content: input.content,
    expectedUpdatedAt: token.token,
  });
  if (outcome.kind === 'published') {
    invalidateSiteSobre();
    revalidatePath('/sobre');
    await sweepPhotos();
  }
  return outcome;
}

export async function restoreAboutRevisionAction(input: {
  revisionId: number;
  expectedUpdatedAt: string | null;
}): Promise<AboutRestoreOutcome> {
  await requireRole('admin');
  const token = parseToken(input?.expectedUpdatedAt);
  if (!token.ok) return badInput;

  const supabase = await createClient();
  const outcome = await restoreAboutRevision(supabase, {
    revisionId: input.revisionId,
    expectedUpdatedAt: token.token,
  });
  if (outcome.kind === 'restored') {
    invalidateSiteSobre();
    revalidatePath('/sobre');
    await sweepPhotos();
  }
  return outcome;
}

/**
 * Passo final do envio da foto da autora. O navegador já mandou o arquivo para `site/sobre/incoming/` com a sessão da
 * administração; aqui o servidor confere, processa (formato real, dimensões, EXIF, recorte 512x512, WebP sem metadados),
 * grava com nome novo e apaga o original. Devolve o caminho novo; ele só entra no conteúdo quando a pessoa salva o rascunho.
 */
export async function finalizeAboutPhoto(objectPath: string): Promise<FinalizePhotoResult> {
  await requireRole('admin');
  const supabase = await createClient();
  const result = await finalizeAboutPhotoWith(supabase, objectPath);
  // A foto nova é recente demais para a varredura apagá-la; ela leva embora o que sobrou de envios antigos.
  await sweepPhotos();
  return result;
}
