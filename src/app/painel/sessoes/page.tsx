import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AdminPage } from '@/components/admin/AdminPage';
import { PanelSkeleton } from '@/components/admin/PanelSkeleton';
import { parseFilter, SessionsList } from '@/components/sessoes/SessionsList';
import styles from '@/components/sessoes/sessoes.module.css';
import { logFailure } from '@/lib/auth/log';
import { requireRole } from '@/lib/auth/session';
import { SESSION_NOTICES, type SessionNotice } from '@/lib/routes';
import { getAdminSessions, type SessionListItem } from '@/lib/sessions/queries';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Sessões' };

const NOTICE_TEXT: Record<SessionNotice, (n: string | null) => string> = {
  publicada: (n) => (n ? `Sessão ${n} publicada.` : 'Sessão publicada.'),
  rascunho: (n) => (n ? `A sessão ${n} voltou para rascunho.` : 'A sessão voltou para rascunho.'),
  excluida: () => 'Rascunho excluído.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/*
 * O esqueleto é um Suspense da própria página, depois do `requireRole`: o 403 de quem não tem papel sai antes de
 * qualquer coisa ser enviada. Um `loading.tsx` aqui o transformaria em 200 (o esqueleto sai antes da checagem).
 */
export default async function SessionsAdminPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole('admin');

  return (
    <Suspense
      fallback={
        <AdminPage>
          <PanelSkeleton />
        </AdminPage>
      }
    >
      <SessionsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SessionsContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = parseFilter(one(params.filtro));
  const notice = SESSION_NOTICES.find((value) => value === one(params.aviso));
  // O número do aviso só é mostrado se for mesmo um número.
  const rawNumber = one(params.n);
  const noticeNumber = rawNumber && /^\d{1,4}$/.test(rawNumber) ? rawNumber : null;

  let sessions: SessionListItem[] = [];
  let failed = false;
  try {
    sessions = await getAdminSessions(await createClient());
  } catch (error) {
    logFailure('sessions: lista', error);
    failed = true;
  }

  return (
    <AdminPage>
      {notice && (
        <p role="status" className={`${styles.banner} ${styles.bannerOk} ${styles.noteOk}`}>
          {NOTICE_TEXT[notice](noticeNumber)}
        </p>
      )}
      {failed ? (
        <p role="alert" className={`${styles.banner} ${styles.bannerError} ${styles.noteOk}`}>
          Não foi possível carregar as sessões agora. Atualize a página em instantes.
        </p>
      ) : (
        <SessionsList sessions={sessions} filter={filter} />
      )}
    </AdminPage>
  );
}
