import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Comentários' };

export default async function CommentsAdminPage() {
  await requireRole('staff');

  return (
    <AdminPage>
      <StubNotice flush>
        No protótipo, esta página é a fila de moderação, com as abas Para aprovar, Aprovados e
        Denúncias, e as regras de moderação.
      </StubNotice>
    </AdminPage>
  );
}
