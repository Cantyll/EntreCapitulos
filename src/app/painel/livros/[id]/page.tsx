import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminPage } from '@/components/admin/AdminPage';
import { BookCover } from '@/components/livros/BookCover';
import { BookForm } from '@/components/livros/BookForm';
import styles from '@/components/livros/books.module.css';
import { CoverUploader } from '@/components/livros/CoverUploader';
import { DeleteBookForm } from '@/components/livros/DeleteBookForm';
import { requireRole } from '@/lib/auth/session';
import { isUuid } from '@/lib/books/cover-path';
import { getAdminBook } from '@/lib/books/queries';
import { ADMIN_BOOKS_HREF } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Editar livro' };

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('admin');

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const book = await getAdminBook(supabase, id);
  if (!book) notFound();

  return (
    <AdminPage back={{ href: ADMIN_BOOKS_HREF, label: 'Voltar para Livros' }}>
      <div className={styles.stack}>
        <section className={`${styles.card} ${styles.formCard}`} aria-labelledby="capa-titulo">
          <div className={styles.cardHead}>
            <h2 id="capa-titulo">Capa</h2>
          </div>
          <div className={styles.row}>
            <BookCover
              title={book.title}
              author={book.author}
              coverUrl={book.coverUrl}
              width={110}
              fontSize={12}
            />
            <div>
              <p className={styles.muted}>
                O link do livro não muda ao editar o título (/livros/{book.slug}).
              </p>
              <CoverUploader bookId={book.id} themeAuto={book.themeAuto} />
            </div>
          </div>
        </section>
        <BookForm
          mode="edit"
          book={{
            id: book.id,
            title: book.title,
            author: book.author,
            synopsis: book.synopsis,
            genres: book.genres,
            totalChapters: book.totalChapters,
          }}
        />
        <section className={`${styles.card} ${styles.formCard}`} aria-labelledby="excluir-secao">
          <div className={styles.cardHead}>
            <h2 id="excluir-secao">Excluir livro</h2>
          </div>
          <DeleteBookForm bookId={book.id} title={book.title} sessionCount={book.sessionCount} />
        </section>
      </div>
    </AdminPage>
  );
}
