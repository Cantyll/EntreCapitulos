import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logFailure } from '@/lib/auth/log';
import { parseRole, type Role } from '@/lib/auth/roles';
import type { Database } from '@/lib/supabase/database.types';

import { toAuditEntries, type AuditEntry, type AuditRow } from './audit';
import { classifyMemberError } from './errors';
import {
  NEW_MEMBER_DAYS,
  memberPageRange,
  type MemberFilter,
  type MemberListParams,
} from './params';
import { likePrefix } from './search';

/*
 * Leituras da gestão de membros. Usam a sessão da administração: o RLS deixa `admin` ler `member_suspensions`,
 * `member_audit` e os comentários de todos os estados; `profiles` é legível por todos. Nenhuma consulta daqui
 * devolve e-mail: o único caminho do e-mail completo é a função `admin_member_contact` (Server Action "Mostrar
 * e-mail", que audita), e a lista só recebe o e-mail MASCARADO de `admin_masked_emails`.
 *
 * Falhas que não impedem a página (uma contagem, as suspensões, os e-mails mascarados, a auditoria) viram
 * "desconhecido" e são registradas só pelo código do erro; a lista em si falha de forma visível.
 */

type Client = SupabaseClient<Database>;

const COUNT = { count: 'exact', head: true } as const;

export type MemberListItem = {
  id: string;
  displayName: string;
  role: Role;
  createdAt: string;
  approvedCount: number;
  /** `null`: não deu para saber (tabela ausente ou erro de leitura). */
  suspended: boolean | null;
};

export type MembersStats = {
  total: number | null;
  staff: number | null;
  suspended: number | null;
  recent: number | null;
};

type CountQuery = PromiseLike<{ count: number | null; error: { code?: string } | null }>;

async function countOf(label: string, query: CountQuery): Promise<number | null> {
  try {
    const { count, error } = await query;
    if (error) {
      if (classifyMemberError(error) !== 'unavailable') logFailure(label, error);
      return null;
    }
    return count ?? 0;
  } catch (error) {
    logFailure(label, error);
    return null;
  }
}

/** Os quatro números do topo, todos reais. Uma contagem que falha vira `null` ("—" na tela). */
export async function getMembersStats(client: Client, now: Date): Promise<MembersStats> {
  const since = new Date(now.getTime() - NEW_MEMBER_DAYS * 86_400_000).toISOString();
  const [total, staff, suspended, recent] = await Promise.all([
    countOf('members.stats.total', client.from('profiles').select('id', COUNT)),
    countOf(
      'members.stats.staff',
      client.from('profiles').select('id', COUNT).in('role', ['admin', 'moderator']),
    ),
    countOf('members.stats.suspended', client.from('member_suspensions').select('user_id', COUNT)),
    countOf(
      'members.stats.recent',
      client.from('profiles').select('id', COUNT).gte('created_at', since),
    ),
  ]);
  return { total, staff, suspended, recent };
}

type ProfileRow = {
  id: string;
  display_name: string;
  role: string;
  approved_comment_count: number;
  created_at: string;
};

const LIST_COLUMNS = 'id, display_name, role, approved_comment_count, created_at';

export type MemberListResult =
  | { ok: true; items: MemberListItem[]; total: number }
  /** O filtro "Suspensos" depende da tabela da migration, que ainda não existe no banco. */
  | { ok: false; reason: 'unavailable' };

/**
 * Uma página (25) de perfis, mais novos primeiro (`created_at`, `id`: ordem estável para paginar). O filtro
 * "Suspensos" usa um join interno com `member_suspensions`; os outros leem só `profiles` e depois buscam as
 * suspensões dos ids da página (assim a lista continua funcionando se a tabela faltar).
 */
export async function getMemberList(
  client: Client,
  { filter, page, search }: MemberListParams,
  now: Date,
): Promise<MemberListResult> {
  const { from, to } = memberPageRange(page);
  const columns =
    filter === 'suspensos' ? `${LIST_COLUMNS}, member_suspensions!inner(user_id)` : LIST_COLUMNS;

  let query = client.from('profiles').select(columns, { count: 'exact' });
  if (filter === 'equipe') query = query.in('role', ['admin', 'moderator']);
  if (filter === 'novos') {
    const since = new Date(now.getTime() - NEW_MEMBER_DAYS * 86_400_000).toISOString();
    query = query.gte('created_at', since);
  }
  if (search) query = query.ilike('display_name', likePrefix(search));

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  if (error) {
    if (filter === 'suspensos' && classifyMemberError(error) === 'unavailable') {
      return { ok: false, reason: 'unavailable' };
    }
    throw error;
  }

  const rows = (data ?? []) as unknown as ProfileRow[];
  const flags =
    filter === 'suspensos'
      ? new Map(rows.map((row) => [row.id, true] as const))
      : await getSuspensionFlags(
          client,
          rows.map((row) => row.id),
        );

  return {
    ok: true,
    total: count ?? rows.length,
    items: rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      role: parseRole(row.role),
      createdAt: row.created_at,
      approvedCount: row.approved_comment_count,
      suspended: flags === null ? null : (flags.get(row.id) ?? false),
    })),
  };
}

/** Quem, entre estes ids, está com os comentários suspensos. `null`: não deu para ler a tabela. */
async function getSuspensionFlags(
  client: Client,
  ids: readonly string[],
): Promise<Map<string, boolean> | null> {
  if (ids.length === 0) return new Map();
  try {
    const { data, error } = await client
      .from('member_suspensions')
      .select('user_id')
      .in('user_id', [...ids]);
    if (error) {
      if (classifyMemberError(error) !== 'unavailable') logFailure('members.suspensions', error);
      return null;
    }
    return new Map((data ?? []).map((row) => [row.user_id, true] as const));
  } catch (error) {
    logFailure('members.suspensions', error);
    return null;
  }
}

export type MaskedEmails =
  | { status: 'ok'; byId: ReadonlyMap<string, string> }
  /** O banco não consegue ler `auth.users` (`contact_unavailable:`): a lista fica sem a coluna de e-mail. */
  | { status: 'contact_unavailable' }
  /** A função ainda não existe no banco. */
  | { status: 'pending' }
  | { status: 'error' };

/**
 * E-mails MASCARADOS ("a***@dominio.com", feitos dentro do banco) dos ids da página (no máximo 100 por chamada;
 * a página tem 25). A lista nunca recebe nem renderiza o e-mail completo.
 */
export async function getMaskedEmails(
  client: Client,
  ids: readonly string[],
): Promise<MaskedEmails> {
  if (ids.length === 0) return { status: 'ok', byId: new Map() };
  try {
    const { data, error } = await client.rpc('admin_masked_emails', { p_user_ids: [...ids] });
    if (error) {
      const key = classifyMemberError(error);
      if (key === 'contact_unavailable') return { status: 'contact_unavailable' };
      if (key === 'unavailable') return { status: 'pending' };
      logFailure('members.masked-emails', error);
      return { status: 'error' };
    }
    return {
      status: 'ok',
      byId: new Map((data ?? []).map((row) => [row.user_id, row.masked_email] as const)),
    };
  } catch (error) {
    logFailure('members.masked-emails', error);
    return { status: 'error' };
  }
}

export type MemberProfile = {
  id: string;
  displayName: string;
  role: Role;
  createdAt: string;
  approvedCount: number;
};

/** O perfil (público) de uma pessoa, ou `null` se não existe. Erro de leitura sobe. */
export async function getMemberProfile(client: Client, id: string): Promise<MemberProfile | null> {
  const { data, error } = await client
    .from('profiles')
    .select(LIST_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    displayName: data.display_name,
    role: parseRole(data.role),
    createdAt: data.created_at,
    approvedCount: data.approved_comment_count,
  };
}

/** Os comentários desta pessoa estão suspensos? `null`: não deu para saber. */
export async function getMemberSuspension(client: Client, id: string): Promise<boolean | null> {
  const flags = await getSuspensionFlags(client, [id]);
  return flags === null ? null : flags.has(id);
}

export type DeletionImpact = {
  /** Comentários da pessoa, em qualquer estado (todos somem com a conta). */
  comments: number | null;
  /** Respostas de OUTRAS pessoas aos comentários dela (somem junto, porque a resposta depende do pai). */
  replies: number | null;
};

/**
 * O que a exclusão leva embora, contado no servidor para o diálogo. Leituras da administração, que lê comentários
 * de todos os estados pelo RLS: aqui o estado NÃO se filtra de propósito, porque todos somem com a conta.
 */
export async function getDeletionImpact(client: Client, id: string): Promise<DeletionImpact> {
  const [comments, replies] = await Promise.all([
    countOf(
      'members.impact.comments',
      client.from('comments').select('id', COUNT).eq('author_id', id),
    ),
    countOf(
      'members.impact.replies',
      client
        .from('comments')
        .select('id, parent:comments!comments_parent_id_fkey!inner(author_id)', COUNT)
        .eq('parent.author_id', id)
        .neq('author_id', id),
    ),
  ]);
  return { comments, replies };
}

export type MemberAudit =
  { status: 'ok'; entries: AuditEntry[] } | { status: 'pending' } | { status: 'error' };

const AUDIT_LIMIT = 50;

/**
 * As últimas 50 linhas da auditoria SOBRE a pessoa, com o nome de quem agiu. `member_audit` não tem chave
 * estrangeira (o alvo pode ser excluído), então os nomes vêm de uma segunda consulta em `profiles`; quem agiu e
 * já teve a conta excluída fica sem nome ("Conta excluída").
 */
export async function getMemberAudit(client: Client, id: string): Promise<MemberAudit> {
  try {
    const { data, error } = await client
      .from('member_audit')
      .select('id, actor_id, action, details, created_at')
      .eq('target_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(AUDIT_LIMIT);
    if (error) {
      if (classifyMemberError(error) === 'unavailable') return { status: 'pending' };
      logFailure('members.audit', error);
      return { status: 'error' };
    }

    const rows = (data ?? []) as AuditRow[];
    const actorIds = [...new Set(rows.map((row) => row.actor_id))];
    const names = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: actors, error: actorsError } = await client
        .from('profiles')
        .select('id, display_name')
        .in('id', actorIds);
      if (actorsError) throw actorsError;
      for (const actor of actors ?? []) names.set(actor.id, actor.display_name);
    }
    return { status: 'ok', entries: toAuditEntries(rows, names) };
  } catch (error) {
    logFailure('members.audit', error);
    return { status: 'error' };
  }
}

export type { MemberFilter };
