import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { BookCover } from '@/components/livros/BookCover';
import { ChapterLegend, ChapterStrip } from '@/components/public/ChapterStrip';
import { Chip } from '@/components/public/Chip';
import { HomeSkeleton } from '@/components/public/Skeleton';
import { ProgressPrompt } from '@/components/public/ProgressPrompt';
import { SessionCard, chaptersText } from '@/components/public/SessionCard';
import { Stars } from '@/components/public/Stars';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { buildChapterStrip } from '@/lib/chapters';
import { loadHome } from '@/lib/public/loaders';
import { bookHref, sessionHref } from '@/lib/routes';
import { SITE_DESCRIPTION, formatDayMonth, isRecent } from '@/lib/site';

import styles from './home.module.css';

export const metadata: Metadata = { description: SITE_DESCRIPTION };

const HOME_SESSIONS = 5;

/*
 * O esqueleto da home é um Suspense da própria página, e não um `loading.tsx` em `(public)/`: um
 * `loading.tsx` ali envolveria TODAS as rotas públicas e o status 404 delas viraria 200 (o esqueleto sai
 * antes de a página descobrir que o livro ou a sessão não existe).
 */
export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const { book, sessions, progress, viewer, finished } = await loadHome();

  if (!book) {
    return (
      <Container>
        <section className={styles.empty}>
          <h1>A próxima leitura vem em breve</h1>
          <p>Enquanto isso, dê uma olhada nos livros que o clube já leu.</p>
          <ButtonLink href="/estante">Ver a estante</ButtonLink>
        </section>
      </Container>
    );
  }

  const strip = buildChapterStrip({
    total: book.totalChapters,
    current: book.currentChapter,
    sessions: sessions.map((s) => ({
      number: s.number,
      chapterFrom: s.chapterFrom,
      chapterTo: s.chapterTo,
    })),
  });
  const last = sessions[0];
  const percent =
    book.totalChapters > 0 ? Math.round((book.currentChapter / book.totalChapters) * 100) : 0;
  const now = new Date();

  return (
    <>
      <section className={styles.band} aria-label="Leitura atual">
        <Container>
          <div className={styles.hero}>
            <div className={styles.coverWrap}>
              <BookCover
                title={book.title}
                author={book.author}
                coverUrl={book.coverUrl}
                width={230}
                fontSize={25}
                priority
              />
            </div>
            <div>
              <span className={styles.live}>
                <i aria-hidden="true" />
                Lendo agora
              </span>
              <h1 className={styles.title}>{book.title}</h1>
              <div className={styles.by}>de {book.author}</div>

              <div className={styles.stripBlock}>
                {book.currentChapter > 0 && (
                  <div className={styles.stripCap}>
                    <span>
                      Capítulo <b>{book.currentChapter}</b> de {book.totalChapters}
                    </span>
                    <span>{percent}% do livro</span>
                  </div>
                )}
                <ChapterStrip strip={strip} bookSlug={book.slug} />
                <ChapterLegend
                  hasSessions={sessions.length > 0}
                  hasNext={strip.nextRange !== null}
                />
              </div>

              <div className={styles.last}>
                {last ? (
                  <>
                    <div className={styles.lastTop}>
                      <Chip>
                        Sessão {last.number}, {chaptersText(last).toLowerCase()}
                      </Chip>
                      {last.membersOnly && <Chip line>Só membros</Chip>}
                      {last.publishedAt && (
                        <span className={styles.muted}>{formatDayMonth(last.publishedAt)}</span>
                      )}
                    </div>
                    <h2 className={styles.lastTitle}>{last.title}</h2>
                    {last.excerpt && <p className={styles.lastExcerpt}>{last.excerpt}</p>}
                    <div className={styles.actions}>
                      <ButtonLink href={sessionHref(book.slug, last.number)}>
                        Ler a sessão
                      </ButtonLink>
                      <ButtonLink href={bookHref(book.slug)} variant="ghost">
                        Sobre o livro
                      </ButtonLink>
                    </div>
                  </>
                ) : (
                  <>
                    <p className={styles.soon}>A primeira sessão sai em breve.</p>
                    <div className={styles.actions}>
                      <ButtonLink href={bookHref(book.slug)} variant="ghost">
                        Sobre o livro
                      </ButtonLink>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <div className={styles.layout}>
          <div>
            {sessions.length > 0 && (
              <section aria-labelledby="sessoes-titulo">
                <div className={styles.secHead}>
                  <h2 id="sessoes-titulo" className={styles.h2}>
                    Sessões de leitura
                  </h2>
                  <Link href="/sessoes" className={styles.link}>
                    Ver todas
                  </Link>
                </div>
                {sessions.slice(0, HOME_SESSIONS).map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    bookSlug={book.slug}
                    isNew={isRecent(session.publishedAt, now)}
                  />
                ))}
              </section>
            )}

            {finished.length > 0 && (
              <section
                aria-labelledby="estante-titulo"
                className={sessions.length ? styles.shelfHead : ''}
              >
                <div className={styles.secHead}>
                  <h2 id="estante-titulo" className={styles.h2}>
                    Da estante
                  </h2>
                  <Link href="/estante" className={styles.link}>
                    Ver estante
                  </Link>
                </div>
                <ul className={styles.miniShelf}>
                  {finished.slice(0, 4).map((b) => (
                    <li key={b.id}>
                      <Link href={bookHref(b.slug)} aria-label={b.title}>
                        <BookCover
                          title={b.title}
                          author={b.author}
                          coverUrl={b.coverUrl}
                          width={150}
                          fontSize={14}
                        />
                        {b.rating !== null && <Stars rating={b.rating} />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className={styles.aside} aria-label="Lateral">
            <section
              className={`${styles.card} ${styles.progressCard}`}
              aria-labelledby="progresso-titulo"
            >
              <h2 id="progresso-titulo">Seu progresso</h2>
              <p>Conte até onde você leu e a gente esconde o resto.</p>
              <ProgressPrompt bookSlug={book.slug} total={book.totalChapters} progress={progress} />
            </section>
            {!viewer && (
              <section
                className={`${styles.card} ${styles.joinCard}`}
                aria-labelledby="entrar-titulo"
              >
                <h2 id="entrar-titulo">Entre no clube</h2>
                <p>Entre com seu e-mail ou conta Google. Seu progresso de leitura fica guardado.</p>
                <ButtonLink href="/entrar" block>
                  Entrar
                </ButtonLink>
              </section>
            )}
          </aside>
        </div>
      </Container>
    </>
  );
}
