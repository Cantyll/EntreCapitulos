import type { AdminBook } from '@/lib/books/queries';

import { BookCover } from './BookCover';
import styles from './books.module.css';
import { FinishBookForm } from './FinishBookForm';
import { percent } from './format';
import { ProgressForm } from './ProgressForm';

/** "Leitura atual": capa, progresso, capítulo atual, total e "Marcar como terminado". */
export function CurrentBookCard({ book }: { book: AdminBook | null }) {
  return (
    <section className={styles.card} aria-labelledby="leitura-atual-titulo" id="leitura-atual">
      <div className={styles.cardHead}>
        <h2 id="leitura-atual-titulo">Leitura atual</h2>
      </div>
      {book ? (
        <>
          <div className={styles.row}>
            <BookCover
              title={book.title}
              author={book.author}
              coverUrl={book.coverUrl}
              width={72}
              fontSize={10}
            />
            <div>
              <b className={styles.bookTitle}>{book.title}</b>
              <div className={styles.muted}>{book.author}</div>
              <div className={styles.progressMeta}>
                <span>
                  Capítulo {book.currentChapter} de {book.totalChapters}
                </span>
                <span>{percent(book.currentChapter, book.totalChapters)}%</span>
              </div>
              <div
                className={styles.progress}
                role="progressbar"
                aria-label="Progresso da leitura"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent(book.currentChapter, book.totalChapters)}
              >
                <span style={{ width: `${percent(book.currentChapter, book.totalChapters)}%` }} />
              </div>
            </div>
          </div>
          <ProgressForm
            bookId={book.id}
            currentChapter={book.currentChapter}
            totalChapters={book.totalChapters}
          />
          <div className={styles.form}>
            <FinishBookForm bookId={book.id} title={book.title} />
          </div>
        </>
      ) : (
        <p className={styles.empty}>
          Nenhum livro em leitura agora. Comece um da fila ou adicione um livro novo. Enquanto isso,
          o site usa o tema padrão.
        </p>
      )}
    </section>
  );
}
