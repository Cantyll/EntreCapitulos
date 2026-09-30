import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Votações' };

export default async function PollsAdminPage() {
  await requireRole('admin');

  return (
    <AdminPage>
      <StubNotice flush>
        No protótipo, esta página mostra o resultado da votação do próximo livro e o formulário de
        uma nova votação.
      </StubNotice>
    </AdminPage>
  );
}
