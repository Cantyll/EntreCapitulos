import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { BookForm } from '@/components/livros/BookForm';
import { requireRole } from '@/lib/auth/session';
import { ADMIN_BOOKS_HREF } from '@/lib/routes';

export const metadata: Metadata = { title: 'Adicionar livro' };

export default async function NewBookPage() {
  await requireRole('admin');

  return (
    <AdminPage back={{ href: ADMIN_BOOKS_HREF, label: 'Voltar para Livros' }}>
      <BookForm mode="create" />
    </AdminPage>
  );
}
