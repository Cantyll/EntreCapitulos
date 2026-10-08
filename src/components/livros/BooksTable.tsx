import { IconLink } from '@/components/ui/IconButton';
import { Icon } from '@/components/ui/Icon';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import type { AdminBook } from '@/lib/books/queries';
import { adminBookHref } from '@/lib/routes';

import { BookCover } from './BookCover';
import styles from './books.module.css';
import { formatDate } from './format';
import { formatRating } from './RatingSelect';

const STATUS_LABEL = { reading: 'Lendo', queued: 'Na fila', finished: 'Terminado' } as const;

/**
 * "Todos os livros": capa, título, autor, estado, progresso ou nota, sessões, comentários e editar. `dataTour` marca o
 * próprio bloco da lista para o tutorial (etapa 8k): um elemento a mais em volta dele, dentro da grade da página,
 * alargaria a página no celular.
 */
export function BooksTable({ books, dataTour }: { books: AdminBook[]; dataTour?: string }) {
  if (books.length === 0) {
    return (
      <p className={styles.empty} data-tour={dataTour}>
        Nenhum livro cadastrado ainda. Use “Adicionar livro”.
      </p>
    );
  }
  return (
    <div className={styles.tableWrap} data-tour={dataTour}>
      <table className={styles.table}>
        <caption>
          <VisuallyHidden>Todos os livros do clube</VisuallyHidden>
        </caption>
        <thead>
          <tr>
            <th scope="col">Livro</th>
            <th scope="col">Estado</th>
            <th scope="col">Progresso ou nota</th>
            <th scope="col">Sessões</th>
            <th scope="col">Comentários</th>
            <th scope="col">
              <VisuallyHidden>Ações</VisuallyHidden>
            </th>
          </tr>
        </thead>
        <tbody>
          {books.map((book) => (
            <tr key={book.id}>
              <td>
                <div className={styles.tBook}>
                  <BookCover
                    title={book.title}
                    author={book.author}
                    coverUrl={book.coverUrl}
                    width={34}
                    fontSize={5}
                    tiny
                  />
                  <div>
                    <b>{book.title}</b>
                    <small>{book.author}</small>
                  </div>
                </div>
              </td>
              <td>{STATUS_LABEL[book.status]}</td>
              <td>
                {book.status === 'reading' ? (
                  `${book.currentChapter} de ${book.totalChapters} capítulos`
                ) : book.status === 'finished' && book.rating !== null ? (
                  <span aria-label={`Nota ${formatRating(book.rating)} de 5`}>
                    ★ {formatRating(book.rating)}
                  </span>
                ) : (
                  <span className={styles.muted}>–</span>
                )}
                {book.status === 'finished' && book.finishedAt && (
                  <small className={styles.muted} style={{ display: 'block' }}>
                    em {formatDate(book.finishedAt)}
                  </small>
                )}
              </td>
              <td>{book.sessionCount || '–'}</td>
              <td>{book.commentCount || '–'}</td>
              <td>
                <IconLink href={adminBookHref(book.id)} label={`Editar ${book.title}`} size="sm">
                  <Icon name="edit" size="sm" />
                </IconLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
