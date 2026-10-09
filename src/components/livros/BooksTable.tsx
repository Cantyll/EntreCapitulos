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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "12 de 52 capítulos", a nota de um livro terminado ou nada. */
function Progress({ book }: { book: AdminBook }) {
  if (book.status === 'reading')
    return <>{`${book.currentChapter} de ${book.totalChapters} capítulos`}</>;
  if (book.status === 'finished' && book.rating !== null) {
    return (
      <span aria-label={`Nota ${formatRating(book.rating)} de 5`}>
        ★ {formatRating(book.rating)}
      </span>
    );
  }
  return null;
}

/**
 * "Todos os livros": capa, título, autor, estado, progresso ou nota, sessões, comentários e editar. A lista decide pela
 * largura dela (como Sessões): tabela com 720px de lista, cartões abaixo disso, com o "Editar" sempre à vista (no
 * celular a tabela rolava e o botão ficava fora da tela). `dataTour` marca os dois desenhos (o tutorial usa o visível);
 * o contêiner da lista tem `min-width: 0`, então não alarga a grade da página no celular (etapa 8k).
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
    <div className={styles.listArea}>
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
                <td className={styles.tProgress}>
                  {book.status === 'reading' ||
                  (book.status === 'finished' && book.rating !== null) ? (
                    <Progress book={book} />
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

      <ul className={styles.cards} data-tour={dataTour}>
        {books.map((book) => (
          <li key={book.id} className={styles.bookCard}>
            <BookCover
              title={book.title}
              author={book.author}
              coverUrl={book.coverUrl}
              width={44}
              fontSize={6}
              tiny
            />
            <div className={styles.bookCardText}>
              <b>{book.title}</b>
              <small>{book.author}</small>
              <div className={styles.cardMeta}>
                <span>{STATUS_LABEL[book.status]}</span>
                {(book.status === 'reading' ||
                  (book.status === 'finished' && book.rating !== null)) && (
                  <span>
                    <Progress book={book} />
                  </span>
                )}
                {book.status === 'finished' && book.finishedAt && (
                  <span>em {formatDate(book.finishedAt)}</span>
                )}
                {book.sessionCount > 0 && (
                  <span>{plural(book.sessionCount, 'sessão', 'sessões')}</span>
                )}
                {book.commentCount > 0 && (
                  <span>{plural(book.commentCount, 'comentário', 'comentários')}</span>
                )}
              </div>
            </div>
            <IconLink href={adminBookHref(book.id)} label={`Editar ${book.title}`} size="sm">
              <Icon name="edit" size="sm" />
            </IconLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
