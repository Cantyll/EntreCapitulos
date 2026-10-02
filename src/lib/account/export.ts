/*
 * Formato do arquivo "Baixar meus dados" (LGPD, direito de acesso). Função pura: recebe só linhas que a
 * própria pessoa leu sob o RLS e copia campo a campo (lista fixa), então um campo a mais que chegue por
 * engano (e-mail de terceiros, dados de outra pessoa) nunca entra no arquivo. Nunca inclui: comentários
 * de outras pessoas, sinalizações da equipe, tokens nem identificadores de sessão do Auth.
 */

export const EXPORT_VERSION = 1;

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
    readingProgress: input.progress.map((row) => ({
      bookSlug: row.books?.slug ?? null,
      bookTitle: row.books?.title ?? null,
      chapter: row.chapter,
      updatedAt: row.updated_at,
    })),
  };
}

/** Nome do arquivo baixado: só a data (fuso de Brasília não importa para o nome). */
export function exportFileName(at: Date): string {
  return `entre-capitulos-meus-dados-${at.toISOString().slice(0, 10)}.json`;
}
