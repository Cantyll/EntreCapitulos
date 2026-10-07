import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';

import { AppBadge } from '@/components/admin/AppBadge';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTabBar } from '@/components/admin/AdminTabBar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { TermsNotice } from '@/components/legal/TermsNotice';
import { TourProvider } from '@/components/tour/TourProvider';
import { TourWelcome } from '@/components/tour/TourWelcome';
import { SkipLink } from '@/components/ui/SkipLink';
import { requireRole } from '@/lib/auth/session';
import { SITE_NAME } from '@/lib/brand';
import { getPendingCount } from '@/lib/comments/admin-queries';
import { needsTermsNotice } from '@/lib/terms';
import { getTermsStatus } from '@/lib/terms/server';
import { getTourSeenVersion } from '@/lib/tour/server';
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
  // Tutorial do painel (etapa 8k): a versão vista (`null` se a leitura falhar: sem cartão automático nem dica) e se o
  // aviso dos Termos está na tela (ele vem antes do cartão "Quer um tour rápido?"). `getTermsStatus` é memoizado: o
  // `TermsNotice` abaixo reaproveita a mesma leitura. Nenhuma das duas derruba o painel.
  const [pendingCommentsCount, tourSeen, termsStatus] = await Promise.all([
    createClient().then((client) => getPendingCount(client)),
    getTourSeenVersion(user.id),
    getTermsStatus(user.id).catch(() => 'unknown' as const),
  ]);
  const tourRole = user.role === 'admin' ? 'admin' : 'moderator';

  return (
    <TourProvider
      role={tourRole}
      initialSeen={tourSeen}
      termsNoticeShown={needsTermsNotice(termsStatus)}
    >
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
            <TourWelcome />
            {children}
          </main>
        </div>
      </div>
      <AdminTabBar pendingComments={pendingCommentsCount} role={user.role} />
      <AppBadge count={pendingCommentsCount} />
    </TourProvider>
  );
}
