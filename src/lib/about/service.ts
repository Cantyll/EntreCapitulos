import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logFailure } from '@/lib/auth/log';
import { stableStringify } from '@/lib/session-editor/snapshot';
import type { Database, Json } from '@/lib/supabase/database.types';

import { defaultAbout } from './defaults';
import { contentSignature } from './editor-model';
import {
  aboutErrorMessage,
  classifyAboutError,
  isAboutUnavailable,
  isExpectedAboutError,
} from './errors';
import {
  ABOUT_ISSUE_MESSAGES,
  parseAbout,
  type AboutContent,
  type AboutFieldError,
  type AboutIssue,
} from './schema';
import type {
  AboutEditorState,
  AboutPublishOutcome,
  AboutRestoreOutcome,
  AboutSaveOutcome,
  HistoryItem,
  ServerDraft,
} from './outcomes';

export type {
  AboutEditorState,
  AboutPublishOutcome,
  AboutRestoreOutcome,
  AboutSaveOutcome,
  HistoryItem,
  ServerDraft,
} from './outcomes';

/*
 * Regras do painel da página Sobre. O cliente só manda o CONTEÚDO (validado aqui com o zod e de novo no banco) e o
 * token de concorrência; quem grava é sempre uma das três funções do banco (`save_site_page_draft`,
 * `publish_site_page`, `restore_site_page_revision`), que conferem de novo que é a administração. O token
 * (`updated_at` do rascunho) é TEXTO OPACO: nunca vira `Date` (o Postgres guarda microssegundos). Nenhum `catch`
 * registra o conteúdo: `logFailure` só leva o erro.
 */

type Client = SupabaseClient<Database>;

export const TOKEN_MAX_LENGTH = 64;

/** O token do cliente, ou `null` (primeiro salvamento). Qualquer outra coisa é recusada antes de ir ao banco. */
export function parseToken(value: unknown): { ok: true; token: string | null } | { ok: false } {
  if (value === null) return { ok: true, token: null };
  if (typeof value === 'string' && value.length > 0 && value.length <= TOKEN_MAX_LENGTH) {
    return { ok: true, token: value };
  }
  return { ok: false };
}

const rpcError = (operation: string, error: unknown): { message: string; pending: boolean } => {
  const db = error as { code?: string | null; message?: string | null };
  if (!isExpectedAboutError(db)) logFailure(operation, error);
  return {
    message: aboutErrorMessage(db),
    pending: classifyAboutError(db) === 'migration_pending',
  };
};

/** O rascunho do servidor (para o banner de conflito). `null` se não existe, não lê ou não passa na validação. */
export async function readServerDraft(supabase: Client): Promise<ServerDraft | null> {
  try {
    const { data, error } = await supabase
      .from('site_page_drafts')
      .select('content, updated_at')
      .eq('slug', 'sobre')
      .maybeSingle();
    if (error) {
      if (!isAboutUnavailable(error)) logFailure('about.rascunho.leitura', error);
      return null;
    }
    if (!data) return null;
    const parsed = parseAbout(data.content);
    return parsed.ok ? { updatedAt: data.updated_at, content: parsed.content } : null;
  } catch (error) {
    logFailure('about.rascunho.leitura', error);
    return null;
  }
}

async function callSave(
  supabase: Client,
  content: AboutContent,
  token: string | null,
): Promise<{ ok: true; updatedAt: string } | { ok: false; error: unknown }> {
  const { data, error } = await supabase.rpc('save_site_page_draft', {
    p_slug: 'sobre',
    p_content: content as unknown as Json,
    ...(token !== null ? { p_expected_updated_at: token } : {}),
  });
  if (error || typeof data !== 'string')
    return { ok: false, error: error ?? new Error('rpc_empty') };
  return { ok: true, updatedAt: data };
}

const invalid = (parsed: { issue: AboutIssue; fields: AboutFieldError[] }) => ({
  kind: 'invalid' as const,
  issue: parsed.issue,
  fields: parsed.fields,
  message: ABOUT_ISSUE_MESSAGES[parsed.issue],
});

/** Salva o rascunho. Conflito (token diferente) devolve a versão do servidor. */
export async function saveAboutDraft(
  supabase: Client,
  args: { content: unknown; expectedUpdatedAt: string | null },
): Promise<AboutSaveOutcome> {
  const parsed = parseAbout(args.content);
  if (!parsed.ok) return invalid(parsed);
  try {
    const saved = await callSave(supabase, parsed.content, args.expectedUpdatedAt);
    if (saved.ok) return { kind: 'saved', updatedAt: saved.updatedAt, content: parsed.content };
    if (classifyAboutError(saved.error as { code?: string; message?: string }) === 'conflict') {
      return { kind: 'conflict', server: await readServerDraft(supabase) };
    }
    return { kind: 'error', ...rpcError('about.salvar', saved.error) };
  } catch (error) {
    logFailure('about.salvar', error);
    return { kind: 'error', message: aboutErrorMessage(null) };
  }
}

/**
 * Publica: salva o conteúdo no rascunho e publica o rascunho. Não é atômico (duas chamadas): se a segunda falhar, o
 * rascunho continua salvo e a resposta traz o token novo (`savedUpdatedAt`), para a tela não dar conflito consigo mesma.
 * As regras da publicação (abertura e seções com texto) valem só aqui; o rascunho aceita texto rico vazio.
 */
export async function publishAbout(
  supabase: Client,
  args: { content: unknown; expectedUpdatedAt: string | null },
): Promise<AboutPublishOutcome> {
  const parsed = parseAbout(args.content, { forPublish: true });
  if (!parsed.ok) return invalid(parsed);
  let savedUpdatedAt: string | undefined;
  try {
    const saved = await callSave(supabase, parsed.content, args.expectedUpdatedAt);
    if (!saved.ok) {
      if (classifyAboutError(saved.error as { code?: string; message?: string }) === 'conflict') {
        return { kind: 'conflict', server: await readServerDraft(supabase) };
      }
      return { kind: 'error', ...rpcError('about.publicar', saved.error) };
    }
    savedUpdatedAt = saved.updatedAt;

    const { data, error } = await supabase.rpc('publish_site_page', {
      p_slug: 'sobre',
      p_expected_updated_at: saved.updatedAt,
    });
    if (error || typeof data !== 'string') {
      if (classifyAboutError(error) === 'conflict') {
        return { kind: 'conflict', server: await readServerDraft(supabase) };
      }
      return {
        kind: 'error',
        ...rpcError('about.publicar', error ?? new Error('rpc_empty')),
        savedUpdatedAt,
      };
    }
    return { kind: 'published', updatedAt: data, content: parsed.content };
  } catch (error) {
    logFailure('about.publicar', error);
    return {
      kind: 'error',
      message: aboutErrorMessage(null),
      ...(savedUpdatedAt ? { savedUpdatedAt } : {}),
    };
  }
}

/** Restaura uma versão do histórico: publica o conteúdo dela e o coloca no rascunho. */
export async function restoreAboutRevision(
  supabase: Client,
  args: { revisionId: unknown; expectedUpdatedAt: string | null },
): Promise<AboutRestoreOutcome> {
  const id = args.revisionId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    return { kind: 'error', message: aboutErrorMessage({ message: 'revision_not_found: x' }) };
  }
  try {
    const { data, error } = await supabase.rpc('restore_site_page_revision', {
      p_slug: 'sobre',
      p_revision_id: id,
      ...(args.expectedUpdatedAt !== null ? { p_expected_updated_at: args.expectedUpdatedAt } : {}),
    });
    if (error || typeof data !== 'string') {
      if (classifyAboutError(error) === 'conflict') {
        return { kind: 'conflict', server: await readServerDraft(supabase) };
      }
      return { kind: 'error', ...rpcError('about.restaurar', error ?? new Error('rpc_empty')) };
    }
    // Depois de restaurar, o rascunho É o conteúdo restaurado: a tela o carrega daqui.
    const server = await readServerDraft(supabase);
    if (!server) return { kind: 'error', message: aboutErrorMessage(null) };
    return { kind: 'restored', updatedAt: data, content: server.content };
  } catch (error) {
    logFailure('about.restaurar', error);
    return { kind: 'error', message: aboutErrorMessage(null) };
  }
}

// ---------------------------------------------------------------------------------------------
// O que o editor mostra ao abrir.
// ---------------------------------------------------------------------------------------------

/** Carrega o estado do editor sob o RLS da administração. Tabela ausente = `available: false` (migration pendente). */
export async function loadAboutEditorState(supabase: Client): Promise<AboutEditorState> {
  try {
    const [draftResult, publishedResult, historyResult] = await Promise.all([
      supabase
        .from('site_page_drafts')
        .select('content, updated_at')
        .eq('slug', 'sobre')
        .maybeSingle(),
      supabase.from('site_pages').select('content, published_at').eq('slug', 'sobre').maybeSingle(),
      supabase
        .from('site_page_revisions')
        .select('id, kind, published_at, published_by, title:content->>title')
        .eq('slug', 'sobre')
        .order('id', { ascending: false })
        .limit(20),
    ]);
    for (const result of [draftResult, publishedResult, historyResult]) {
      const { error } = result;
      if (error) {
        if (isAboutUnavailable(error)) return { available: false };
        logFailure('about.editor.leitura', error);
        return { available: false };
      }
    }

    const draftRow = draftResult.data;
    const publishedRow = publishedResult.data;
    const draft = draftRow ? parseAbout(draftRow.content) : null;
    const published = publishedRow ? parseAbout(publishedRow.content) : null;

    let source: 'draft' | 'published' | 'default' = 'default';
    let content: AboutContent = defaultAbout();
    let contentUnreadable = false;
    if (draftRow) {
      if (draft?.ok) {
        source = 'draft';
        content = draft.content;
      } else contentUnreadable = true;
    } else if (publishedRow) {
      if (published?.ok) {
        source = 'published';
        content = published.content;
      } else contentUnreadable = true;
    }

    const hasUnpublishedChanges = draft?.ok
      ? !published?.ok || stableStringify(draft.content) !== stableStringify(published.content)
      : false;

    const rows = (historyResult.data ?? []) as unknown as {
      id: number;
      kind: string;
      published_at: string;
      published_by: string | null;
      title: string | null;
    }[];
    const names = await historyAuthorNames(
      supabase,
      rows.map((row) => row.published_by).filter((id): id is string => id !== null),
    );
    const history: HistoryItem[] = rows.map((row) => ({
      id: row.id,
      kind: row.kind === 'restore' ? 'restore' : 'publish',
      publishedAt: row.published_at,
      byName: row.published_by ? (names.get(row.published_by) ?? null) : null,
      title: row.title ?? '',
    }));

    return {
      available: true,
      source,
      content,
      draftUpdatedAt: draftRow?.updated_at ?? null,
      hasUnpublishedChanges,
      publishedAt: publishedRow?.published_at ?? null,
      publishedSignature: published?.ok ? contentSignature(published.content) : null,
      contentUnreadable,
      history,
    };
  } catch (error) {
    logFailure('about.editor.leitura', error);
    return { available: false };
  }
}

async function historyAuthorNames(supabase: Client, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', unique);
  if (error) {
    logFailure('about.editor.nomes', error);
    return new Map();
  }
  return new Map((data ?? []).map((row) => [row.id, row.display_name]));
}

/**
 * A página Sobre já foi publicada alguma vez? `false` mostra o aviso do texto provisório (só para a administração);
 * `true` e `null` não mostram nada. Uma leitura simples: se falhar (ou a tabela não existir), `null`, sem aviso.
 */
export async function isAboutPublished(supabase: Client): Promise<boolean | null> {
  try {
    const { count, error } = await supabase
      .from('site_pages')
      .select('slug', { count: 'exact', head: true })
      .eq('slug', 'sobre');
    if (error) {
      if (!isAboutUnavailable(error)) logFailure('about.publicada', error);
      return null;
    }
    return (count ?? 0) > 0;
  } catch (error) {
    logFailure('about.publicada', error);
    return null;
  }
}
