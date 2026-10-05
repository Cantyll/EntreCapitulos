/*
 * Arquivo "dados da pessoa" baixado pela administração (etapa 8f). Tem o MESMO formato de "Baixar meus dados"
 * (`buildAccountExport`, versão 2), só com dados dela: o perfil e os comentários o route handler lê pelo RLS da
 * administração, sempre filtrados pelo id da pessoa; a conta (e-mail, último acesso, provedores) e o progresso de
 * leitura vêm da função `admin_member_export`, que também grava a linha de auditoria `export_data`.
 */
import {
  buildAccountExport,
  type AccountExport,
  type ExportAccountInput,
  type ExportCommentInput,
  type ExportProfileInput,
  type ExportProgressInput,
} from '@/lib/account/export';
import { isUuid } from '@/lib/comments/rules';
import { formatIsoDay } from '@/lib/site';

/**
 * `dados-<8 primeiros caracteres do uuid>-<AAAA-MM-DD>.json`. NUNCA tem nome nem e-mail da pessoa, e a data é a
 * de Brasília (às 23h30 de um dia o arquivo ainda leva o dia que a administração viveu, não o de UTC).
 */
export function memberExportFileName(id: string, at: Date): string {
  if (!isUuid(id)) throw new Error('member_export: invalid id');
  return `dados-${id.slice(0, 8).toLowerCase()}-${formatIsoDay(at)}.json`;
}

export type AdminExportPayload = {
  account: ExportAccountInput;
  progress: ExportProgressInput[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * Lê o JSON de `admin_member_export` campo a campo. Devolve `null` se o formato não for o esperado ou se a
 * conta devolvida não for a da pessoa pedida: nunca se monta um arquivo com dados de outra pessoa.
 */
export function parseAdminExportPayload(
  raw: unknown,
  expectedId: string,
): AdminExportPayload | null {
  if (!isRecord(raw) || !isRecord(raw.account) || !Array.isArray(raw.progress)) return null;
  const { account } = raw;
  if (typeof account.id !== 'string' || account.id.toLowerCase() !== expectedId.toLowerCase()) {
    return null;
  }

  const progress: ExportProgressInput[] = [];
  for (const row of raw.progress) {
    if (!isRecord(row) || typeof row.chapter !== 'number' || typeof row.updated_at !== 'string') {
      return null;
    }
    const slug = textOrNull(row.book_slug);
    const title = textOrNull(row.book_title);
    progress.push({
      chapter: row.chapter,
      updated_at: row.updated_at,
      books: slug !== null && title !== null ? { slug, title } : null,
    });
  }

  return {
    account: {
      id: account.id,
      email: textOrNull(account.email),
      createdAt: textOrNull(account.created_at),
      lastSignInAt: textOrNull(account.last_sign_in_at),
      providers: Array.isArray(account.providers)
        ? account.providers.filter((item): item is string => typeof item === 'string')
        : [],
    },
    progress,
  };
}

export function buildMemberExport(input: {
  generatedAt: Date;
  payload: AdminExportPayload;
  profile: ExportProfileInput | null;
  comments: readonly ExportCommentInput[];
  commentsSuspended: boolean;
}): AccountExport {
  return buildAccountExport({
    generatedAt: input.generatedAt,
    account: input.payload.account,
    profile: input.profile,
    comments: input.comments,
    progress: input.payload.progress,
    commentsSuspended: input.commentsSuspended,
  });
}
