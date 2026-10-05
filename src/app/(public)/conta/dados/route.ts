import { logFailure } from '@/lib/auth/log';
import {
  buildAccountExport,
  exportFileName,
  type ExportCommentInput,
  type ExportProgressInput,
} from '@/lib/account/export';
import { classifyMemberError } from '@/lib/members/errors';
import { createClient } from '@/lib/supabase/server';

/*
 * "Baixar meus dados" (LGPD, direito de acesso). Só dados da PRÓPRIA pessoa:
 *  - a identidade vem do Auth (cookie), nunca de parâmetro;
 *  - toda consulta filtra pelo id dela (a equipe lê os comentários de todo mundo pelo RLS, então o filtro
 *    por autor é indispensável aqui) e o arquivo copia campo a campo (ver `buildAccountExport`).
 * Resposta sempre `no-store` e como anexo.
 */

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

const PAGE = 1000;

function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    const user = auth.user;
    if (authError || !user || user.is_anonymous) {
      return json({ erro: 'Entre na sua conta para baixar os seus dados.' }, 401);
    }

    const profileQuery = supabase
      .from('profiles')
      .select(
        'display_name, avatar_url, role, approved_comment_count, display_name_confirmed_at, created_at, updated_at',
      )
      .eq('id', user.id)
      .maybeSingle();

    // Comentários em QUALQUER estado (aprovado, pendente, removido), só os dela, em páginas de 1000.
    const comments: ExportCommentInput[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('comments')
        .select(
          'id, session_id, parent_id, body, status, read_up_to, spoiler_up_to, created_at, updated_at, reading_sessions(number, books(slug))',
        )
        .eq('author_id', user.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      comments.push(...(data as unknown as ExportCommentInput[]));
      if (data.length < PAGE) break;
    }

    const progressQuery = supabase
      .from('reading_progress')
      .select('chapter, updated_at, books(slug, title)')
      .eq('user_id', user.id);

    // A situação da suspensão de comentários (versão 2 do arquivo): a pessoa lê só a PRÓPRIA linha pelo RLS.
    const suspensionQuery = supabase
      .from('member_suspensions')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const [profile, progress, suspension] = await Promise.all([
      profileQuery,
      progressQuery,
      suspensionQuery,
    ]);
    if (profile.error) throw profile.error;
    if (progress.error) throw progress.error;
    // Sem a tabela (migration ainda não aplicada) não existe suspensão nenhuma. Qualquer outro erro derruba o
    // arquivo: uma cópia de dados que omite uma informação em silêncio é pior que um erro.
    if (suspension.error && classifyMemberError(suspension.error) !== 'unavailable') {
      throw suspension.error;
    }

    const now = new Date();
    const body = buildAccountExport({
      generatedAt: now,
      account: {
        id: user.id,
        email: user.email ?? null,
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        providers: Array.isArray(user.app_metadata?.providers)
          ? user.app_metadata.providers.filter((p: unknown): p is string => typeof p === 'string')
          : [],
      },
      profile: profile.data,
      comments,
      progress: progress.data as unknown as ExportProgressInput[],
      commentsSuspended: suspension.data !== null && !suspension.error,
    });

    return json(body, 200, {
      'Content-Disposition': `attachment; filename="${exportFileName(now)}"`,
    });
  } catch (error) {
    logFailure('account.export', error);
    return json(
      { erro: 'Não foi possível gerar o arquivo agora. Tente de novo em instantes.' },
      500,
    );
  }
}
