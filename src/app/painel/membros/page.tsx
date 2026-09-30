import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Membros' };

export default async function MembersAdminPage() {
  await requireRole('admin');

  return (
    <AdminPage>
      <StubNotice flush>
        No protótipo, esta página tem os indicadores, a busca, o convite e a tabela de membros com
        papel e status.
      </StubNotice>
    </AdminPage>
  );
}
