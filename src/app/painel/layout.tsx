import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTabBar } from '@/components/admin/AdminTabBar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { SkipLink } from '@/components/ui/SkipLink';
import { SITE_NAME } from '@/lib/brand';
import { pendingCommentsCount } from '@/lib/sample-data';

import styles from './layout.module.css';

export const metadata: Metadata = {
  title: { default: `Painel · ${SITE_NAME}`, template: `%s · Painel · ${SITE_NAME}` },
  // Sem login até a Fase 1: o painel fica fora dos buscadores.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <div className={styles.admin}>
        <AdminSidebar pendingComments={pendingCommentsCount} />
        <div className={styles.column}>
          <AdminTopbar pendingComments={pendingCommentsCount} />
          <main id="conteudo" tabIndex={-1} className={styles.main}>
            {children}
          </main>
        </div>
      </div>
      <AdminTabBar pendingComments={pendingCommentsCount} />
    </>
  );
}
