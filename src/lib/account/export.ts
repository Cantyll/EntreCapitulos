/*
 * Formato do arquivo "Baixar meus dados" (LGPD, direito de acesso). Função pura: recebe só linhas que a
 * própria pessoa leu sob o RLS e copia campo a campo (lista fixa), então um campo a mais que chegue por
 * engano (e-mail de terceiros, dados de outra pessoa) nunca entra no arquivo. Nunca inclui: comentários
 * de outras pessoas, sinalizações da equipe, tokens nem identificadores de sessão do Auth.
 *
 * Versões: 1 (etapa 7a) e 2 (etapa 8f: `profile.commentsSuspended`, a situação da suspensão de comentários, que
 * a própria pessoa também recebe) e 3 (etapa 8g: `termsAcceptance`, a versão e as datas do aceite dos Termos e da
 * declaração de ter 18 anos ou mais, ou `null` se a pessoa nunca aceitou). O arquivo que a administração baixa de
 * uma pessoa tem o mesmo formato.
 */
import { formatIsoDay } from '@/lib/site';

export const EXPORT_VERSION = 3;

export type ExportAccountInput = {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  providers: readonly string[];
};

export type ExportProfileInput = {
  display_name: string;
  avatar_url: string | null;
  role: string;
  approved_comment_count: number;
  display_name_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExportCommentInput = {
  id: string;
  session_id: string;
  parent_id: string | null;
  body: string;
  status: string;
  read_up_to: number;
  spoiler_up_to: number | null;
  created_at: string;
  updated_at: string;
  reading_sessions?: { number: number; books?: { slug: string } | null } | null;
};

/** A linha de `terms_acceptances` (colunas do banco). */
export type ExportTermsInput = {
  version: string;
  accepted_at: string;
  first_accepted_at: string;
};

export type ExportProgressInput = {
  chapter: number;
  updated_at: string;
  books?: { slug: string; title: string } | null;
};

export type AccountExport = {
  exportVersion: number;
  generatedAt: string;
  account: ExportAccountInput;
  profile: {
    displayName: string;
    avatarUrl: string | null;
    role: string;
    approvedCommentCount: number;
    displayNameConfirmedAt: string | null;
    /** Os comentários dela estão suspensos pela administração? (versão 2) */
    commentsSuspended: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
  comments: {
    id: string;
    status: string;
    body: string;
    parentId: string | null;
    sessionId: string;
    sessionNumber: number | null;
    bookSlug: string | null;
    readUpTo: number;
    spoilerUpTo: number | null;
    createdAt: string;
    updatedAt: string;
  }[];
  /** O último aceite dos Termos e a data do primeiro (versão 3). `null`: nunca aceitou. */
  termsAcceptance: {
    version: string;
    acceptedAt: string;
    firstAcceptedAt: string;
  } | null;
  readingProgress: {
    bookSlug: string | null;
    bookTitle: string | null;
    chapter: number;
    updatedAt: string;
  }[];
};

export function buildAccountExport(input: {
  generatedAt: Date;
  account: ExportAccountInput;
  profile: ExportProfileInput | null;
  comments: readonly ExportCommentInput[];
  progress: readonly ExportProgressInput[];
  commentsSuspended: boolean;
  /** `null` ou ausente: a pessoa nunca aceitou (ou a tabela ainda não existe). */
  terms?: ExportTermsInput | null;
}): AccountExport {
  const { account, profile } = input;
  return {
    exportVersion: EXPORT_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    account: {
      id: account.id,
      email: account.email,
      createdAt: account.createdAt,
      lastSignInAt: account.lastSignInAt,
      providers: [...account.providers],
    },
    profile: profile && {
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      role: profile.role,
      approvedCommentCount: profile.approved_comment_count,
      displayNameConfirmedAt: profile.display_name_confirmed_at,
      commentsSuspended: input.commentsSuspended,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    },
    comments: input.comments.map((comment) => ({
      id: comment.id,
      status: comment.status,
      body: comment.body,
      parentId: comment.parent_id,
      sessionId: comment.session_id,
      sessionNumber: comment.reading_sessions?.number ?? null,
      bookSlug: comment.reading_sessions?.books?.slug ?? null,
      readUpTo: comment.read_up_to,
      spoilerUpTo: comment.spoiler_up_to,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
    })),
    termsAcceptance: input.terms
      ? {
          version: input.terms.version,
          acceptedAt: input.terms.accepted_at,
          firstAcceptedAt: input.terms.first_accepted_at,
        }
      : null,
    readingProgress: input.progress.map((row) => ({
      bookSlug: row.books?.slug ?? null,
      bookTitle: row.books?.title ?? null,
      chapter: row.chapter,
      updatedAt: row.updated_at,
    })),
  };
}

/** Nome do arquivo baixado: só a data, a de Brasília (às 23h30 o instante já é do dia seguinte em UTC). */
export function exportFileName(at: Date): string {
  return `entre-capitulos-meus-dados-${formatIsoDay(at)}.json`;
}
