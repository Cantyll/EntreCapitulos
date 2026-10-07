import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { BooksTable } from '@/components/livros/BooksTable';
import styles from '@/components/livros/books.module.css';
import { CurrentBookCard } from '@/components/livros/CurrentBookCard';
import { QueueCard } from '@/components/livros/QueueCard';
import { ThemeCard } from '@/components/livros/ThemeCard';
import { Icon } from '@/components/ui/Icon';
import { ButtonLink } from '@/components/ui/Button';
import { requireRole } from '@/lib/auth/session';
import { getAdminBooks } from '@/lib/books/queries';
import { ADMIN_NEW_BOOK_HREF } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Livros' };

export default async function BooksAdminPage() {
  await requireRole('admin');

  const supabase = await createClient();
  const books = await getAdminBooks(supabase);
  const reading = books.find((book) => book.status === 'reading') ?? null;
  const queue = books.filter((book) => book.status === 'queued');

  return (
    <AdminPage>
      <div className={styles.stack}>
        <CurrentBookCard book={reading} />
        <QueueCard books={queue} reading={reading} />
        <ThemeCard book={reading} />
        <div className={styles.toolbar}>
          <h2>Todos os livros</h2>
          <ButtonLink href={ADMIN_NEW_BOOK_HREF} size="sm" data-tour="books-new">
            <Icon name="plus" size="sm" />
            Adicionar livro
          </ButtonLink>
        </div>
        <div data-tour="books-list">
          <BooksTable books={books} />
        </div>
      </div>
    </AdminPage>
  );
}
