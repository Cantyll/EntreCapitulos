import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';

export const metadata: Metadata = { title: 'Membros' };

export default function MembersAdminPage() {
  return (
    <AdminPage>
      <StubNotice flush>
        No protótipo, esta página tem os indicadores, a busca, o convite e a tabela de membros com
        papel e status.
      </StubNotice>
    </AdminPage>
  );
}
