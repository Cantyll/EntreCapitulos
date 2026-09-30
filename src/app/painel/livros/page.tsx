import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';

export const metadata: Metadata = { title: 'Livros' };

export default function BooksAdminPage() {
  return (
    <AdminPage>
      <StubNotice flush>
        No protótipo, esta página tem a leitura atual (capítulo e total), a fila, a capa com o tema
        do site e a lista de todos os livros.
      </StubNotice>
    </AdminPage>
  );
}
