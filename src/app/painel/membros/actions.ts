'use server';

import { logFailure } from '@/lib/auth/log';
import { redirectTo } from '@/lib/auth/redirect';
import { requireRole } from '@/lib/auth/session';
import { isUuid } from '@/lib/comments/rules';
import {
  MEMBER_MESSAGES,
  classifyMemberError,
  cleanSearchText,
  isUnexpectedMemberError,
  looksLikeEmail,
  memberListHref,
  parseMemberFilter,
} from '@/lib/members';
import { adminMemberHref } from '@/lib/routes';
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
