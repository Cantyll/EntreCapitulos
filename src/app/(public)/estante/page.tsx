import type { Metadata } from 'next';
import Link from 'next/link';

import { BookCover } from '@/components/livros/BookCover';
import { Stars } from '@/components/public/Stars';
import { Container } from '@/components/ui/Container';
import { parseShelfTab } from '@/lib/public/params';
import { loadShelf } from '@/lib/public/loaders';
import { bookHref } from '@/lib/routes';
import { calendarDateTime, formatCalendarMonthYear } from '@/lib/site';

import styles from '../shelf.module.css';

export const metadata: Metadata = {
  title: 'Estante do clube',
  description: 'Os livros que o clube já leu e os próximos da fila.',
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function ShelfPage({ searchParams }: Props) {
  const [params, { finished, queued, counts, commentCounts }] = await Promise.all([
    searchParams,
    loadShelf(),
  ]);
  const tab = parseShelfTab(params.aba);

  const sessionTotal = finished.reduce((sum, book) => sum + (counts.get(book.id) ?? 0), 0);
  const commentTotal = finished.reduce((sum, book) => sum + (commentCounts.get(book.id) ?? 0), 0);
  const parts = [
    finished.length > 0 ? plural(finished.length, 'livro terminado', 'livros terminados') : null,
    sessionTotal > 0 ? plural(sessionTotal, 'sessão', 'sessões') : null,
    commentTotal > 0 ? plural(commentTotal, 'comentário', 'comentários') : null,
  ].filter((part): part is string => part !== null);
  // "a", "a e b", "a, b e c"
  const summary =
    parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : (parts[0] ?? '');

  return (
    <Container>
      <section className={styles.hero}>
        <h1>Estante do clube</h1>
        {summary && <p>{summary}.</p>}
      </section>

      <nav className={styles.tabs} aria-label="Estante">
        <Link
          href="/estante"
          className={styles.tab}
          aria-current={tab === 'lidos' ? 'page' : undefined}
        >
          Lidos
          {finished.length > 0 && <small>{finished.length}</small>}
        </Link>
        <Link
          href={'/estante?aba=fila' as never}
          className={styles.tab}
          aria-current={tab === 'fila' ? 'page' : undefined}
        >
          Na fila
          {queued.length > 0 && <small>{queued.length}</small>}
        </Link>
      </nav>

      {tab === 'lidos' ? (
        finished.length > 0 ? (
          <ul className={styles.shelf}>
            {finished.map((book) => {
              const sessions = counts.get(book.id) ?? 0;
              const comments = commentCounts.get(book.id) ?? 0;
              return (
                <li key={book.id} className={styles.tile}>
                  <Link href={bookHref(book.slug)}>
                    <BookCover
                      title={book.title}
                      author={book.author}
                      coverUrl={book.coverUrl}
                      width={172}
                      fontSize={17}
                    />
                    <h2>{book.title}</h2>
                  </Link>
                  <div className={styles.au}>{book.author}</div>
                  {book.rating !== null && (
                    <Stars rating={book.rating} showValue className={styles.stars} />
                  )}
                  <div className={styles.meta}>
                    {book.finishedAt && (
                      <>
                        Terminado em{' '}
                        <time dateTime={calendarDateTime(book.finishedAt)}>
                          {formatCalendarMonthYear(book.finishedAt)}
                        </time>
                      </>
                    )}
                    {sessions > 0 && (
                      <>
                        {book.finishedAt && <br />}
                        {plural(sessions, 'sessão', 'sessões')}
                        {comments > 0 && `, ${plural(comments, 'comentário', 'comentários')}`}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.empty}>Nenhum livro terminado ainda.</p>
        )
      ) : queued.length > 0 ? (
        <ul className={styles.next}>
          {queued.map((book) => (
            <li key={book.id} className={styles.nextItem}>
              <BookCover
                title={book.title}
                author={book.author}
                coverUrl={book.coverUrl}
                width={84}
                fontSize={10}
              />
              <div>
                <h2>
                  <Link href={bookHref(book.slug)}>{book.title}</Link>
                </h2>
                <div className={styles.au}>{book.author}</div>
                {book.synopsis && <p>{book.synopsis}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>A fila está vazia por enquanto.</p>
      )}
    </Container>
  );
}
