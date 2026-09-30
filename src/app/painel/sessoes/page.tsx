import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';

export const metadata: Metadata = { title: 'Sessões' };

export default function SessionsAdminPage() {
  return (
    <AdminPage>
      <StubNotice flush>
        No protótipo, esta página tem a tabela das sessões publicadas, dos rascunhos e das
        agendadas, com filtro por status.
      </StubNotice>
    </AdminPage>
  );
}
