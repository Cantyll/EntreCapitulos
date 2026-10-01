import type { AdminBook } from '@/lib/books/queries';

import { BookCover } from './BookCover';
import styles from './books.module.css';
import { StartBookForm } from './StartBookForm';

/** "Na fila": livros `queued`. Sem votos (chegam na Fase 2). */
export function QueueCard({ books, reading }: { books: AdminBook[]; reading: AdminBook | null }) {
  return (
    <section className={styles.card} aria-labelledby="fila-titulo">
      <div className={styles.cardHead}>
        <h2 id="fila-titulo">Na fila</h2>
      </div>
      {books.length === 0 ? (
        <p className={styles.empty}>
          Nenhum livro na fila. Adicione um livro com o estado “Na fila”.
        </p>
      ) : (
        <div>
          {books.map((book) => (
            <div key={book.id} className={styles.queueItem}>
              <BookCover
                title={book.title}
                author={book.author}
                coverUrl={book.coverUrl}
                width={44}
                fontSize={6}
                tiny
              />
              <div>
                <b>{book.title}</b>
                <div className={styles.muted}>{book.author}</div>
              </div>
              <div className={styles.queueAction}>
                {reading ? (
                  <p className={styles.note}>
                    Já há um livro em leitura (“{reading.title}”). Para começar este, termine o
                    atual primeiro: <a href="#leitura-atual">ir para a leitura atual</a>.
                  </p>
                ) : (
                  <StartBookForm bookId={book.id} title={book.title} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
