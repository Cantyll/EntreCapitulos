'use server';

import { revalidatePath } from 'next/cache';

import { logFailure } from '@/lib/auth/log';
import { redirectTo } from '@/lib/auth/redirect';
import { ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { requireRole } from '@/lib/auth/session';
import { isUuid } from '@/lib/comments/rules';
import {
  MEMBER_MESSAGES,
  classifyMemberError,
  cleanSearchText,
  isDeleteConfirmed,
  isNameConfirmed,
  isUnexpectedMemberError,
  looksLikeEmail,
  memberListHref,
  parseMemberFilter,
  type MemberErrorKey,
} from '@/lib/members';
import { getPublicSessions } from '@/lib/public/queries';
import { invalidateComments } from '@/lib/public/tags';
import { ADMIN_MEMBERS_HREF, adminMemberHref } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

/*
 * Ações da gestão de membros (etapa 8f). TODA action confere `requireRole('admin')` no servidor, valida o id
 * (uuid) e deixa o banco decidir de novo (cada função do banco confere `is_admin()`, sob uma trava). O cliente só
 * manda o que a tela mostra: o id da pessoa, o cargo escolhido e os textos digitados, que o servidor confere.
 * Nunca registrar nome nem e-mail no log: `logFailure` só leva o erro.
 */

export type SearchState = { status: 'idle' } | { status: 'error'; message: string };

const failSearch = (message: string): SearchState => ({ status: 'error', message });

/**
 * A caixa de busca. Texto com "@" é busca por e-mail EXATO: vai por POST (esta action), nunca entra na URL nem no
 * log, e leva ao perfil. O resto é busca por nome (prefixo) e vira `?busca=`, que é público (nomes são públicos).
 * Busca por e-mail não grava auditoria (decisão da etapa 8f); "Mostrar e-mail" e "Baixar dados" gravam.
 */
export async function searchMembers(
  _previous: SearchState,
  formData: FormData,
): Promise<SearchState> {
  await requireRole('admin');

  const raw = formData.get('q');
  const typed = typeof raw === 'string' ? raw : '';
  const filter = parseMemberFilter(formData.get('filtro'));

  if (looksLikeEmail(typed)) {
    let found: string | null = null;
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_find_member_by_email', {
        p_email: typed.slice(0, 400),
      });
      if (error) {
        const key = classifyMemberError(error);
        if (isUnexpectedMemberError(key)) logFailure('members.find-by-email', error);
        return failSearch(MEMBER_MESSAGES[key]);
      }
      // O tipo gerado diz `string`, mas a função devolve nulo quando ninguém tem esse e-mail.
      found = (data as string | null) ?? null;
    } catch (error) {
      logFailure('members.find-by-email', error);
      return failSearch(MEMBER_MESSAGES.generic);
    }
    if (!isUuid(found)) return failSearch(MEMBER_MESSAGES.email_not_found);
    redirectTo(adminMemberHref(found));
  }

  redirectTo(memberListHref({ filter, search: cleanSearchText(typed) }));
}

// --- Perfil de uma pessoa ----------------------------------------------------------------------------------

export type MemberActionResult =
  | { ok: true; message: string; changed: boolean }
  | { ok: false; message: string; code: MemberErrorKey };

const fail = (code: MemberErrorKey): MemberActionResult => ({
  ok: false,
  message: MEMBER_MESSAGES[code],
  code,
});

/** Erro do banco que veio na resposta (não lançado): mapeia, registra só o inesperado e devolve a mensagem. */
function failFromDb(operation: string, error: { code?: string | null; message?: string | null }) {
  const code = classifyMemberError(error);
  if (isUnexpectedMemberError(code)) logFailure(operation, error);
  return fail(code);
}

const ROLE_VALUES: readonly string[] = ['admin', 'moderator', 'member'];
const toRole = (value: unknown): Role | null =>
  typeof value === 'string' && ROLE_VALUES.includes(value) ? (value as Role) : null;

/** Todas as sessões públicas e as contagens: o que vale expirar quando não se sabe onde a pessoa comentou. */
async function expireAllPublicComments(): Promise<void> {
  try {
    for (const session of await getPublicSessions()) invalidateComments(session.id);
  } catch (error) {
    logFailure('members.invalidate-all', error);
  }
  invalidateComments();
}

/**
 * Depois de mudar o cargo: expira `comments:<sessão>` das sessões em que a pessoa comentou (para o selo mudar
 * na hora). Se a consulta falhar ou a pessoa tiver comentários demais para listar, expira todas as públicas.
 */
async function expireCommentsOf(authorId: string): Promise<void> {
  const LIMIT = 1000;
  try {
    const supabase = await createClient();
    // Leitura da administração, sem filtro de estado de propósito: o selo aparece em comentários aprovados, e
    // basta saber em que sessões a pessoa comentou.
    const { data, error } = await supabase
      .from('comments')
      .select('session_id')
      .eq('author_id', authorId)
      .limit(LIMIT);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length >= LIMIT) {
      await expireAllPublicComments();
      return;
    }
    for (const sessionId of new Set(rows.map((row) => row.session_id))) {
      invalidateComments(sessionId);
    }
    invalidateComments();
  } catch (error) {
    logFailure('members.invalidate', error);
    await expireAllPublicComments();
  }
}

/**
 * Altera o cargo. `expectedRole` é o cargo que a tela mostrava: se mudou nesse meio tempo (outra pessoa da
 * administração), o banco recusa (`role_conflict`) em vez de sobrescrever em silêncio. Para dar Administração, o
 * nome digitado é conferido AQUI contra o nome de exibição da pessoa. A própria conta, a última administração e
 * quem está suspenso (ao virar equipe) o banco recusa.
 */
export async function changeMemberRole(
  id: string,
  role: unknown,
  expectedRole: unknown,
  typedName: unknown,
): Promise<MemberActionResult> {
  await requireRole('admin');
  if (!isUuid(id)) return fail('invalid_id');
  const target = toRole(role);
  if (target === null) return fail('invalid_role');
  const expected = toRole(expectedRole);
  if (expected === null) return fail('invalid_input');

  try {
    const supabase = await createClient();

    if (target === 'admin') {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', id)
        .maybeSingle();
      if (error) return failFromDb('members.role', error);
      if (!profile) return fail('target_not_found');
      if (!isNameConfirmed(typedName, profile.display_name)) return fail('confirm_name');
    }

    const { data, error } = await supabase.rpc('set_member_role', {
      p_user_id: id,
      p_role: target,
      p_expected_role: expected,
    });
    if (error) return failFromDb('members.role', error);

    const previous = toRole(data) ?? expected;
    if (previous === target) {
      return {
        ok: true,
        changed: false,
        message: `A pessoa já tinha o cargo ${ROLE_LABELS[target]}. Nada mudou.`,
      };
    }

    await expireCommentsOf(id);
    revalidatePath('/painel', 'layout');
    return {
      ok: true,
      changed: true,
      message: `Cargo alterado: ${ROLE_LABELS[previous]} → ${ROLE_LABELS[target]}.`,
    };
  } catch (error) {
    logFailure('members.role', error);
    return fail('generic');
  }
}

/** Suspende (`true`) ou reativa (`false`) os comentários de um membro. Equipe e a própria conta o banco recusa. */
export async function setMemberSuspension(
  id: string,
  suspended: unknown,
): Promise<MemberActionResult> {
  await requireRole('admin');
  if (!isUuid(id)) return fail('invalid_id');
  if (typeof suspended !== 'boolean') return fail('invalid_input');

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('set_member_suspension', {
      p_user_id: id,
      p_suspended: suspended,
    });
    if (error) return failFromDb('members.suspension', error);

    // A suspensão não muda nada público (o site continua igual para quem lê): só o painel é refeito.
    revalidatePath('/painel', 'layout');
    if (data !== true) {
      return {
        ok: true,
        changed: false,
        message: suspended
          ? 'Os comentários desta pessoa já estavam suspensos. Nada mudou.'
          : 'Os comentários desta pessoa já estavam ativos. Nada mudou.',
      };
    }
    return {
      ok: true,
      changed: true,
      message: suspended ? 'Comentários suspensos.' : 'Comentários reativados.',
    };
  } catch (error) {
    logFailure('members.suspension', error);
    return fail('generic');
  }
}

export type ContactResult =
  | {
      ok: true;
      email: string | null;
      lastSignInAt: string | null;
      providers: string[];
    }
  | { ok: false; message: string; code: MemberErrorKey };

/**
 * "Mostrar e-mail": e-mail, último acesso e provedores de UMA pessoa. A função do banco grava a auditoria
 * (`view_contact`) só depois de ler com sucesso; se o banco não conseguir ler `auth.users`, devolve
 * `contact_unavailable:` e nada é gravado. O resultado volta só para a tela que pediu e vive só no estado dela:
 * esta action não revalida nada nem coloca o e-mail em URL, cookie ou cache.
 */
export async function showMemberContact(id: string): Promise<ContactResult> {
  await requireRole('admin');
  if (!isUuid(id)) return { ok: false, message: MEMBER_MESSAGES.invalid_id, code: 'invalid_id' };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('admin_member_contact', { p_user_id: id });
    if (error) {
      const result = failFromDb('members.contact', error);
      return { ok: false, message: result.message, code: result.ok ? 'generic' : result.code };
    }
    const row = data?.[0];
    if (!row) {
      return { ok: false, message: MEMBER_MESSAGES.target_not_found, code: 'target_not_found' };
    }
    return {
      ok: true,
      email: row.email ?? null,
      lastSignInAt: row.last_sign_in_at ?? null,
      providers: Array.isArray(row.providers)
        ? row.providers.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch (error) {
    logFailure('members.contact', error);
    return { ok: false, message: MEMBER_MESSAGES.generic, code: 'generic' };
  }
}

/**
 * Exclui a conta de um MEMBRO (a mesma cascata de "Excluir minha conta"). Confirmação digitada (`EXCLUIR`),
 * conferida aqui. Equipe e a própria conta o banco recusa. Depois expira as sessões públicas e as contagens,
 * refaz o layout do painel (contador de pendentes) e volta para a lista com um aviso.
 */
export async function deleteMember(id: string, confirmation: unknown): Promise<MemberActionResult> {
  await requireRole('admin');
  if (!isUuid(id)) return fail('invalid_id');
  if (!isDeleteConfirmed(confirmation)) return fail('confirm_delete');

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('admin_delete_member', { p_user_id: id });
    if (error) return failFromDb('members.delete', error);
  } catch (error) {
    logFailure('members.delete', error);
    return fail('generic');
  }

  // A conta já foi excluída: falhar daqui para a frente não desfaz nada (o cache expira sozinho em 5 minutos).
  await expireAllPublicComments();
  revalidatePath('/painel', 'layout');
  redirectTo(`${ADMIN_MEMBERS_HREF}?aviso=conta-excluida`);
}
