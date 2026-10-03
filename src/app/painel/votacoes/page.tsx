import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { ComingSoon } from '@/components/admin/ComingSoon';
import { requireRole } from '@/lib/auth/session';
import { comingSoonPages } from '@/lib/coming-soon';

const page = comingSoonPages.votacoes;

export const metadata: Metadata = { title: page.title };

export default async function PollsAdminPage() {
  await requireRole('admin');

  return (
    <AdminPage>
      <ComingSoon title={page.title}>{page.description}</ComingSoon>
    </AdminPage>
  );
}
