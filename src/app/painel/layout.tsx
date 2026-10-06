import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';

import { AppBadge } from '@/components/admin/AppBadge';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTabBar } from '@/components/admin/AdminTabBar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { TermsNotice } from '@/components/legal/TermsNotice';
import { SkipLink } from '@/components/ui/SkipLink';
import { requireRole } from '@/lib/auth/session';
import { SITE_NAME } from '@/lib/brand';
import { getPendingCount } from '@/lib/comments/admin-queries';
import { createClient } from '@/lib/supabase/server';

import styles from './layout.module.css';

export const metadata: Metadata = {
  title: { default: `Painel · ${SITE_NAME}`, template: `%s · Painel · ${SITE_NAME}` },
  // O painel é privado: fora dos buscadores.
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Layouts não rodam de novo a cada navegação interna: cada página também confere o papel.
  const user = await requireRole('staff');
  // O contador de pendentes (barra lateral, barra inferior e sino): um head count só para a equipe. O
  // layout não roda de novo a cada navegação interna; as actions de moderação o refazem com
  // `revalidatePath('/painel', 'layout')`. Falha na contagem não derruba o painel.
  const pendingCommentsCount = await getPendingCount(await createClient());

  return (
    <>
      <SkipLink />
      <div className={styles.admin}>
        <AdminSidebar
          pendingComments={pendingCommentsCount}
          role={user.role}
          displayName={user.displayName}
        />
        <div className={styles.column}>
          <AdminTopbar pendingComments={pendingCommentsCount} />
          {/* Aviso do aceite dos Termos: a equipe é isenta para comentar, mas também aceita. */}
          <Suspense fallback={null}>
            <TermsNotice user={user} />
          </Suspense>
          <main id="conteudo" tabIndex={-1} className={styles.main}>
            {children}
          </main>
        </div>
      </div>
      <AdminTabBar pendingComments={pendingCommentsCount} role={user.role} />
      <AppBadge count={pendingCommentsCount} />
    </>
  );
}
