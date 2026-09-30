import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTabBar } from '@/components/admin/AdminTabBar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { SkipLink } from '@/components/ui/SkipLink';
import { requireRole } from '@/lib/auth/session';
import { SITE_NAME } from '@/lib/brand';
import { pendingCommentsCount } from '@/lib/sample-data';

import styles from './layout.module.css';

export const metadata: Metadata = {
  title: { default: `Painel · ${SITE_NAME}`, template: `%s · Painel · ${SITE_NAME}` },
  robots: { index: false, follow: false },
};

/**
 * Só a equipe (administradora e moderadora) entra. O layout não roda de novo a cada navegação
 * entre páginas do painel, então cada `page.tsx` e cada Server Action também chama
 * `requireRole()`. O RLS do banco é a garantia final.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole('staff');

  return (
    <>
      <SkipLink />
      <div className={styles.admin}>
        <AdminSidebar
          role={user.role}
          name={user.displayName}
          pendingComments={pendingCommentsCount}
        />
        <div className={styles.column}>
          <AdminTopbar pendingComments={pendingCommentsCount} />
          <main id="conteudo" tabIndex={-1} className={styles.main}>
            {children}
          </main>
        </div>
      </div>
      <AdminTabBar role={user.role} pendingComments={pendingCommentsCount} />
    </>
  );
}
