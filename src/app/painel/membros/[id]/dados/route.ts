import { logFailure } from '@/lib/auth/log';
import { requireRole } from '@/lib/auth/session';
import type { ExportCommentInput } from '@/lib/account/export';
import { isUuid } from '@/lib/comments/rules';
import {
  buildMemberExport,
  classifyMemberError,
  isSameOrigin,
  memberExportFileName,
  parseAdminExportPayload,
  readOriginHeaders,
  type MemberNotice,
} from '@/lib/members';
import { adminMemberHref } from '@/lib/routes';
import { isTourUnavailable } from '@/lib/tour/errors';
import { createClient } from '@/lib/supabase/server';

/*
 * "Baixar dados da pessoa" (etapa 8f), só POST: a função do banco grava a auditoria (`export_data`), e nenhuma ação
 * que grave algo pode ser acionável por GET (um link, uma imagem, um prefetch). Defesas, em ordem: a requisição
 * precisa vir do próprio site (`Origin`; o cookie SameSite=Lax já não vai em POST de outro site), `requireRole
 * ('admin')`, uuid. Tudo é lido filtrando pelo id da pessoa (a administração lê os comentários de todo mundo pelo
 * RLS, então o filtro por autor é indispensável), e `admin_member_export` é chamada POR ÚLTIMO: a linha de
 * auditoria só existe se o arquivo foi montado, e sem a auditoria (`contact_unavailable:`) não há arquivo.
 * O nome do arquivo nunca tem nome nem e-mail da pessoa. Resposta `no-store` e como anexo; falhas voltam ao perfil
 * por redirecionamento com um aviso de lista fixa, em vez de jogar um JSON na tela de quem clicou.
 */

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

const PAGE = 1000;

function backToProfile(id: string, notice: MemberNotice): Response {
  return new Response(null, {
    status: 303,
    headers: { ...HEADERS, Location: `${adminMemberHref(id)}?aviso=${notice}` },
  });
}

const status = (code: number) => new Response(null, { status: code, headers: HEADERS });

export async function POST(request: Request, context: RouteContext<'/painel/membros/[id]/dados'>) {
  if (!isSameOrigin(readOriginHeaders(request.headers))) return status(403);

  await requireRole('admin');
  const { id } = await context.params;
  if (!isUuid(id)) return status(404);

  try {
    const supabase = await createClient();

    const profile = await supabase
      .from('profiles')
      .select(
        'display_name, avatar_url, role, approved_comment_count, display_name_confirmed_at, created_at, updated_at',
      )
      .eq('id', id)
      .maybeSingle();
    if (profile.error) throw profile.error;
    if (!profile.data) return status(404);

    // Comentários em QUALQUER estado, só os dela, em páginas de 1000 (o estado não se filtra de propósito:
    // o arquivo de dados é completo, como o de "Baixar meus dados").
    const comments: ExportCommentInput[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('comments')
        .select(
          'id, session_id, parent_id, body, status, read_up_to, spoiler_up_to, created_at, updated_at, reading_sessions(number, books(slug))',
        )
        .eq('author_id', id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      comments.push(...(data as unknown as ExportCommentInput[]));
      if (data.length < PAGE) break;
    }

    const suspension = await supabase
      .from('member_suspensions')
      .select('user_id')
      .eq('user_id', id)
      .maybeSingle();
    if (suspension.error && classifyMemberError(suspension.error) !== 'unavailable') {
      throw suspension.error;
    }

    // A versão do tutorial do painel vista (versão 4), à parte: sem a coluna (antes do Database deploy), `null`.
    const tour = await supabase
      .from('profiles')
      .select('tour_seen_version')
      .eq('id', id)
      .maybeSingle();
    if (tour.error && !isTourUnavailable(tour.error)) throw tour.error;
    const tourSeen = (tour.data as { tour_seen_version?: unknown } | null)?.tour_seen_version;

    // Por último: é ela que grava a auditoria.
    const { data: raw, error } = await supabase.rpc('admin_member_export', { p_user_id: id });
    if (error) {
      const key = classifyMemberError(error);
      if (key === 'contact_unavailable') return backToProfile(id, 'dados-indisponiveis');
      if (key === 'target_not_found') return status(404);
      if (key === 'unavailable') return backToProfile(id, 'atualizacao-pendente');
      logFailure('members.export', error);
      return backToProfile(id, 'exportacao-falhou');
    }

    const payload = parseAdminExportPayload(raw, id);
    if (!payload) {
      const unexpected = new Error('unexpected export payload');
      logFailure('members.export', unexpected);
      return backToProfile(id, 'exportacao-falhou');
    }

    const now = new Date();
    const body = buildMemberExport({
      generatedAt: now,
      payload,
      profile: profile.data,
      comments,
      commentsSuspended: suspension.data !== null && !suspension.error,
      tourSeenVersion: !tour.error && typeof tourSeen === 'number' ? tourSeen : null,
    });

    return new Response(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        ...HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${memberExportFileName(id, now)}"`,
      },
    });
  } catch (error) {
    logFailure('members.export', error);
    return backToProfile(id, 'exportacao-falhou');
  }
}
