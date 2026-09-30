import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';

export const metadata: Metadata = { title: 'Votações' };

export default function PollsAdminPage() {
  return (
    <AdminPage>
      <StubNotice flush>
        No protótipo, esta página mostra o resultado da votação do próximo livro e o formulário de
        uma nova votação.
      </StubNotice>
    </AdminPage>
  );
}
