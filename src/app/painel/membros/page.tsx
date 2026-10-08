import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminPage } from '@/components/admin/AdminPage';
import { MembersFilters } from '@/components/membros/MembersFilters';
import { MembersList, type MemberRow } from '@/components/membros/MembersList';
import { MembersSearch } from '@/components/membros/MembersSearch';
import { MembersStats } from '@/components/membros/MembersStats';
import styles from '@/components/membros/members.module.css';
import { RolesCard } from '@/components/membros/RolesCard';
import { redirectTo } from '@/lib/auth/redirect';
import { requireRole } from '@/lib/auth/session';
import {
  MEMBER_MESSAGES,
  MEMBER_NOTICES,
  memberListHref,
  memberPageCount,
  parseMemberListParams,
  parseMemberNotice,
} from '@/lib/members';
import { getMaskedEmails, getMemberList, getMembersStats } from '@/lib/members/queries';
import { formatFullDate } from '@/lib/site';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Membros' };

export default async function MembersAdminPage({ searchParams }: PageProps<'/painel/membros'>) {
  await requireRole('admin');

  const query = await searchParams;
  const params = parseMemberListParams(query);
  const notice = parseMemberNotice(query.aviso);

  const supabase = await createClient();
  const now = new Date();
  const [stats, list] = await Promise.all([
    getMembersStats(supabase, now),
    getMemberList(supabase, params, now),
  ]);

  const pages = list.ok ? memberPageCount(list.total) : 1;
  if (list.ok && params.page > pages) {
    redirectTo(memberListHref({ ...params, page: pages }));
  }

  // E-mail MASCARADO dos ids desta página (feito no banco). O completo nunca chega a esta página.
  const masked = list.ok
    ? await getMaskedEmails(
        supabase,
        list.items.map((item) => item.id),
      )
    : null;
  const showEmail = masked?.status === 'ok';

  const rows: MemberRow[] = list.ok
    ? list.items.map((item) => ({
        ...item,
        joined: formatFullDate(item.createdAt),
        maskedEmail: masked?.status === 'ok' ? (masked.byId.get(item.id) ?? null) : null,
      }))
    : [];

  const emptyText = params.search
    ? 'Nenhuma pessoa com esse começo de nome'
    : params.filter === 'todos'
      ? 'Nenhum membro ainda'
      : 'Ninguém neste filtro';

  return (
    <AdminPage>
      <div className={styles.stack}>
        {notice && (
          <p
            role="status"
            className={MEMBER_NOTICES[notice].tone === 'ok' ? styles.noticeOk : styles.noticeError}
          >
            {MEMBER_NOTICES[notice].message}
          </p>
        )}

        <MembersStats stats={stats} />

        <div className={styles.layout}>
          <section aria-label="Membros" className={styles.listArea}>
            <div className={styles.toolbar}>
              <MembersSearch search={params.search} filter={params.filter} />
              <MembersFilters active={params.filter} search={params.search} stats={stats} />
            </div>

            {params.search && (
              <p className={styles.searching}>
                <span>Nomes que começam com “{params.search}”.</span>
                <Link href={memberListHref({ filter: params.filter }) as never}>Limpar busca</Link>
              </p>
            )}

            {!list.ok && (
              <p role="status" className={styles.noticeInfo}>
                {MEMBER_MESSAGES.unavailable} Enquanto isso, os outros filtros funcionam.
              </p>
            )}
            {masked?.status === 'contact_unavailable' && (
              <p role="status" className={styles.noticeInfo}>
                O banco não consegue ler os dados da conta agora: a lista fica sem a coluna de
                e-mail e a busca por e-mail não funciona.
              </p>
            )}
            {masked && (masked.status === 'pending' || masked.status === 'error') && (
              <p role="status" className={styles.noticeInfo}>
                {masked.status === 'pending'
                  ? `${MEMBER_MESSAGES.unavailable} A lista fica sem a coluna de e-mail.`
                  : 'Não foi possível carregar os e-mails agora. A lista fica sem essa coluna.'}
              </p>
            )}

            {list.ok && <MembersList rows={rows} showEmail={showEmail} emptyText={emptyText} />}

            {pages > 1 && (
              <nav className={styles.pager} aria-label="Páginas">
                {params.page > 1 ? (
                  <Link href={memberListHref({ ...params, page: params.page - 1 }) as never}>
                    Página anterior
                  </Link>
                ) : (
                  <span />
                )}
                <span>
                  Página {params.page} de {pages}
                </span>
                {params.page < pages ? (
                  <Link href={memberListHref({ ...params, page: params.page + 1 }) as never}>
                    Próxima página
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </section>

          <RolesCard />
        </div>
      </div>
    </AdminPage>
  );
}
