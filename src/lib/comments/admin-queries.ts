import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logFailure } from '@/lib/auth/log';
import { parseRole } from '@/lib/auth/roles';
import type { Database } from '@/lib/supabase/database.types';

import { TAB_STATUS, pageRange, type ModerationTab } from './moderation';
import type { CommentRole } from './types';

/*
 * Leituras da moderação (painel). Usam a sessão da equipe: o RLS deixa `admin` e `moderator` lerem todos os
 * estados, e `comment_flags` só a equipe lê. Cada consulta filtra o estado EXPLICITAMENTE pela aba.
 */

type Client = SupabaseClient<Database>;

export type ModerationItem = {
  id: string;
  authorName: string;
  authorRole: CommentRole;
  body: string;
  readUpTo: number | null;
  spoilerUpTo: number | null;
  status: 'pending' | 'approved' | 'removed';
  createdAt: string;
  /** Alerta automático ou da moderação ("Contém link"); `null` se não há. */
  flagReason: string | null;
  isReply: boolean;
  session: {
    id: string;
    number: number;
    title: string;
    chapterTo: number;
    bookSlug: string;
    bookTitle: string;
    totalChapters: number;
  } | null;
};

type Row = {
  id: string;
  parent_id: string | null;
  body: string;
  read_up_to: number | null;
  spoiler_up_to: number | null;
  status: string;
  created_at: string;
  author: { display_name: string; role: string } | null;
  flag: { reason: string } | null;
  session: {
    id: string;
    number: number;
    title: string;
    chapter_to: number;
    books: { slug: string; title: string; total_chapters: number } | null;
  } | null;
};

const COLUMNS =
  'id, parent_id, body, read_up_to, spoiler_up_to, status, created_at, author:profiles!comments_author_id_fkey(display_name, role), flag:comment_flags(reason), session:reading_sessions!comments_session_id_fkey(id, number, title, chapter_to, books(slug, title, total_chapters))';

const asStatus = (value: string): ModerationItem['status'] =>
  value === 'approved' || value === 'removed' ? value : 'pending';

function toItem(row: Row): ModerationItem {
  const book = row.session?.books ?? null;
  return {
    id: row.id,
    authorName: row.author?.display_name ?? 'Leitor',
    authorRole: parseRole(row.author?.role),
    body: row.body,
    readUpTo: row.read_up_to !== null && row.read_up_to >= 1 ? row.read_up_to : null,
    spoilerUpTo: row.spoiler_up_to,
    status: asStatus(row.status),
    createdAt: row.created_at,
    flagReason: row.flag?.reason ?? null,
    isReply: row.parent_id !== null,
    session:
      row.session && book
        ? {
            id: row.session.id,
            number: row.session.number,
            title: row.session.title,
            chapterTo: row.session.chapter_to,
            bookSlug: book.slug,
            bookTitle: book.title,
            totalChapters: book.total_chapters,
          }
        : null,
  };
}

export type ModerationCounts = Record<ModerationTab, number>;

export type ModerationPage = { items: ModerationItem[]; counts: ModerationCounts };

/**
 * A página da aba, mais as três contagens. Três consultas em paralelo: a lista (com a contagem exata da
 * própria aba) e dois head counts das outras. Fila de aprovação: do mais antigo para o mais novo; as
 * outras abas: do mais novo para o mais antigo.
 */
export async function getModerationPage(
  supabase: Client,
  tab: ModerationTab,
  page: number,
): Promise<ModerationPage> {
  const { from, to } = pageRange(page);
  const ascending = tab === 'pendentes';

  const head = (status: string) =>
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('status', status);

  const [list, ...others] = await Promise.all([
    supabase
      .from('comments')
      .select(COLUMNS, { count: 'exact' })
      .eq('status', TAB_STATUS[tab])
      .order('created_at', { ascending })
      .order('id', { ascending })
      .range(from, to),
    ...(['pendentes', 'aprovados', 'removidos'] as const)
      .filter((other) => other !== tab)
      .map((other) => head(TAB_STATUS[other])),
  ]);
  if (list.error) throw list.error;
  for (const result of others) if (result.error) throw result.error;

  const counts = { pendentes: 0, aprovados: 0, removidos: 0 } satisfies ModerationCounts;
  counts[tab] = list.count ?? 0;
  const rest = (['pendentes', 'aprovados', 'removidos'] as const).filter((other) => other !== tab);
  rest.forEach((other, index) => {
    counts[other] = others[index]?.count ?? 0;
  });

  return { items: ((list.data ?? []) as unknown as Row[]).map(toItem), counts };
}

/**
 * Quantos comentários esperam aprovação (o contador do painel). Um head count com o índice parcial
 * `comments_pending_created_at_idx`. A falha não derruba o painel: o contador some.
 */
export async function getPendingCount(supabase: Client): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    logFailure('painel: contagem de comentários pendentes', error);
    return 0;
  }
}
