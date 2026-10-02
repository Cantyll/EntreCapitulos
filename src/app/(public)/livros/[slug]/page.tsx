import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { BookCover } from '@/components/livros/BookCover';
import { ChapterLegend } from '@/components/public/ChapterStrip';
import { ChapterMap } from '@/components/public/ChapterMap';
import { Chip } from '@/components/public/Chip';
import { BookSkeleton } from '@/components/public/Skeleton';
import { ProgressPrompt } from '@/components/public/ProgressPrompt';
import { Stars } from '@/components/public/Stars';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { buildChapterStrip } from '@/lib/chapters';
import { loadBookPage } from '@/lib/public/loaders';
import { sessionHref } from '@/lib/routes';
import {
  SITE_NAME,
  calendarDateTime,
  formatCalendarDay,
  formatCalendarMonthYear,
  formatDayMonth,
} from '@/lib/site';

import styles from './book.module.css';

type Props = PageProps<'/livros/[slug]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadBookPage(slug);
  if (!data) return {};
  const { book } = data;
  return {
    title: `${book.title}, de ${book.author}`,
    description:
      book.synopsis?.trim() ||
      `${book.title}, de ${book.author}, no clube de leitura ${SITE_NAME}.`,
  };
}

/*
 * O esqueleto é um Suspense da própria página (e não um `loading.tsx` em `livros/[slug]/`): um
 * `loading.tsx` ali envolveria também a rota da sessão, e o 404 dela viraria 200.
 */
export default function BookPage(props: Props) {
  return (
    <Suspense fallback={<BookSkeleton />}>
      <BookContent {...props} />
    </Suspense>
  );
}

async function BookContent({ params }: Props) {
  const { slug } = await params;
  const data = await loadBookPage(slug);
  if (!data) notFound();

  const { book, isCurrent, sessions, progress, marginNotes } = data;
  const started = book.status !== 'queued';
  const strip = buildChapterStrip({
    total: book.totalChapters,
    current: book.status === 'finished' ? book.totalChapters : book.currentChapter,
    sessions: sessions.map((s) => ({
      number: s.number,
      chapterFrom: s.chapterFrom,
      chapterTo: s.chapterTo,
    })),
  });
  const read = book.status === 'finished' ? book.totalChapters : book.currentChapter;
  const percent = book.totalChapters > 0 ? Math.round((read / book.totalChapters) * 100) : 0;
  const last = sessions[0];
  const commentTotal = sessions.reduce((sum, s) => sum + s.commentCount, 0);

  return (
    <Container>
      <nav aria-label="Caminho">
        <ol className={styles.crumbs}>
          <li>
            <Link href="/">Início</Link>
          </li>
          <li>
            <Link href={isCurrent ? `/livro` : '/estante'}>
              {isCurrent ? 'Lendo agora' : 'Estante'}
            </Link>
          </li>
          <li aria-current="page">{book.title}</li>
        </ol>
      </nav>

      <section className={styles.head} aria-labelledby="livro-titulo">
        <BookCover
          title={book.title}
          author={book.author}
          coverUrl={book.coverUrl}
          width={240}
          fontSize={26}
          priority
        />
        <div>
          {book.status === 'reading' && (
            <span className={styles.live}>
              <i aria-hidden="true" />
              {book.startedAt ? (
                <>
                  Lendo desde{' '}
                  <time dateTime={calendarDateTime(book.startedAt)}>
                    {formatCalendarDay(book.startedAt)}
                  </time>
                </>
              ) : (
                'Lendo agora'
              )}
            </span>
          )}
          {book.status === 'finished' && (
            <div className={styles.statusLine}>
              {book.finishedAt && (
                <span>
                  Terminado em{' '}
                  <time dateTime={calendarDateTime(book.finishedAt)}>
                    {formatCalendarMonthYear(book.finishedAt)}
                  </time>
                </span>
              )}
              {book.rating !== null && <Stars rating={book.rating} showValue />}
            </div>
          )}
          {book.status === 'queued' && <div className={styles.statusLine}>Na fila de leitura</div>}

          <h1 id="livro-titulo" className={styles.title}>
            {book.title}
          </h1>
          <div className={styles.by}>de {book.author}</div>
          {book.synopsis && <p className={styles.synopsis}>{book.synopsis}</p>}
          {book.genres.length > 0 && (
            <ul
              className={styles.chips}
              aria-label="Gêneros"
              style={{ listStyle: 'none', padding: 0, margin: 0 }}
            >
              {book.genres.map((genre) => (
                <li key={genre}>
                  <Chip line>{genre}</Chip>
                </li>
              ))}
            </ul>
          )}

          {started && (
            <ul className={styles.facts} aria-label="Números do livro">
              {read > 0 && (
                <li>
                  <b>
                    {read}/{book.totalChapters}
                  </b>
                  capítulos lidos pela Agatha
                </li>
              )}
              {percent > 0 && (
                <li>
                  <b>{percent}%</b>
                  do livro
                </li>
              )}
              {sessions.length > 0 && (
                <li>
                  <b>{sessions.length}</b>
                  {sessions.length === 1 ? 'sessão' : 'sessões'}
                </li>
              )}
              {commentTotal > 0 && (
                <li>
                  <b>{commentTotal}</b>
                  {commentTotal === 1 ? 'comentário' : 'comentários'}
                </li>
              )}
            </ul>
          )}

          {last && (
            <div className={styles.actions}>
              <ButtonLink href={sessionHref(book.slug, last.number)}>
                Ler a última sessão
              </ButtonLink>
            </div>
          )}
        </div>
      </section>

      {started && (
        <section className={styles.block} aria-labelledby="mapa-titulo">
          <div className={styles.blockHead}>
            <h2 id="mapa-titulo" className={styles.h2}>
              Mapa de capítulos
            </h2>
            <ChapterLegend hasSessions={sessions.length > 0} hasNext={strip.nextRange !== null} />
          </div>
          <div className={styles.progress}>
            <ProgressPrompt bookSlug={book.slug} total={book.totalChapters} progress={progress} />
          </div>
          <ChapterMap strip={strip} bookSlug={book.slug} />
          {sessions.length > 0 && (
            <p className={styles.note}>
              Toque em um capítulo com número destacado para abrir a sessão em que ele foi
              comentado.
            </p>
          )}
        </section>
      )}

      {started && (sessions.length > 0 || book.startedAt || marginNotes.length > 0) && (
        <div
          className={`${styles.block} ${styles.twoCol} ${marginNotes.length === 0 ? styles.single : ''}`}
        >
          {(sessions.length > 0 || book.startedAt) && (
            <section aria-labelledby="linha-titulo">
              <h2 id="linha-titulo" className={styles.h2}>
                Linha do tempo
              </h2>
              <ol className={styles.timeline}>
                {sessions.map((s, i) => (
                  <li key={s.id} className={`${styles.tl} ${i === 0 ? styles.first : ''}`}>
                    <Link href={sessionHref(book.slug, s.number)}>
                      <small>
                        {s.publishedAt ? `${formatDayMonth(s.publishedAt)}, ` : ''}
                        {s.chapterFrom === s.chapterTo
                          ? `capítulo ${s.chapterFrom}`
                          : `capítulos ${s.chapterFrom} a ${s.chapterTo}`}
                      </small>
                      <h3>{s.title}</h3>
                      {s.commentCount > 0 && (
                        <small>
                          {s.commentCount} {s.commentCount === 1 ? 'comentário' : 'comentários'}
                        </small>
                      )}
                    </Link>
                  </li>
                ))}
                {book.startedAt && (
                  <li className={styles.tl}>
                    <small>{formatCalendarDay(book.startedAt)}</small>
                    <h3>Começamos o livro</h3>
                  </li>
                )}
              </ol>
            </section>
          )}

          {marginNotes.length > 0 && (
            <section aria-labelledby="margem-titulo">
              <h2 id="margem-titulo" className={styles.h2}>
                Anotações na margem
              </h2>
              <ul className={styles.notes}>
                {marginNotes.map((note) => (
                  <li key={note.id}>
                    <blockquote className={styles.qcard}>
                      {note.text}
                      <cite>
                        Sessão {note.sessionNumber}
                        {note.reference ? `, ${note.reference}` : ''}
                      </cite>
                    </blockquote>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Container>
  );
}
