import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Discussion } from '@/components/comments/Discussion';
import { BookCover } from '@/components/livros/BookCover';
import { ChapterStrip } from '@/components/public/ChapterStrip';
import { Chip } from '@/components/public/Chip';
import { CoverableBlock } from '@/components/public/Coverable';
import { chaptersText } from '@/components/public/SessionCard';
import { ProgressPrompt } from '@/components/public/ProgressPrompt';
import { DiscussionSkeleton } from '@/components/public/Skeleton';
import { Stars } from '@/components/public/Stars';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { BackButton } from '@/components/ui/BackButton';
import { Container } from '@/components/ui/Container';
import { Icon } from '@/components/ui/Icon';
import { signInPath } from '@/lib/auth/safe-next';
import { buildChapterStrip, nextChapterRange } from '@/lib/chapters';
import { parseCommentOrder } from '@/lib/comments';
import { loadSessionPage } from '@/lib/public/loaders';
import { parseSessionNumber } from '@/lib/public/params';
import { bookHref, sessionHref } from '@/lib/routes';
import { SessionBody, dividersOf } from '@/lib/session-body';
import { AUTHOR, SITE_NAME, formatFullDate } from '@/lib/site';
import { effectiveProgress, isExtrasCovered } from '@/lib/spoiler';

import styles from './session.module.css';

type Props = PageProps<'/livros/[slug]/sessoes/[numero]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, numero } = await params;
  const number = parseSessionNumber(numero);
  if (number === null) return {};
  const data = await loadSessionPage(slug, number);
  // Sem vazar nada: sessão só para membros e sessão inexistente têm o mesmo título genérico.
  if (data.kind !== 'ok') {
    return { title: 'Entre para continuar', robots: { index: false, follow: false } };
  }
  const { session, book } = data;
  return {
    title: `Sessão ${session.number}: ${session.title} · ${book.title}`,
    // O resumo, e não o corpo: a prévia do link não dá spoiler.
    description:
      session.excerpt?.trim() ||
      `Sessão ${session.number} de ${book.title}, ${chaptersText(session).toLowerCase()}, no ${SITE_NAME}.`,
    ...(session.membersOnly ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function SessionPage({ params, searchParams }: Props) {
  const { slug, numero } = await params;
  const { ordem } = await searchParams;
  const number = parseSessionNumber(numero);
  if (number === null) notFound();

  const data = await loadSessionPage(slug, number);
  if (data.kind === 'not-found') notFound();
  if (data.kind === 'login') {
    return (
      <Container>
        <section className={styles.login} aria-labelledby="entrar-titulo">
          <h1 id="entrar-titulo">Entre para continuar</h1>
          <p>Para ler esta página, entre no clube com seu e-mail ou conta Google.</p>
          <ButtonLink href={signInPath(sessionHref(slug, number)) as never}>Entrar</ButtonLink>
        </section>
      </Container>
    );
  }

  const { book, session, sessions, progress, viewer } = data;
  const commentCount = sessions.find((s) => s.id === session.id)?.commentCount ?? 0;
  const known = progress !== null;
  const shown = effectiveProgress(progress);
  const extrasCovered = isExtrasCovered(shown, session.chapterTo);

  const strip = buildChapterStrip({
    total: book.totalChapters,
    current: book.status === 'finished' ? book.totalChapters : book.currentChapter,
    sessions: sessions.map((s) => ({
      number: s.number,
      chapterFrom: s.chapterFrom,
      chapterTo: s.chapterTo,
    })),
  });

  const index = sessions.findIndex((s) => s.id === session.id);
  const newer = index > 0 ? sessions[index - 1] : undefined;
  const older = index >= 0 ? sessions[index + 1] : undefined;
  const upcoming =
    !newer && book.status === 'reading'
      ? nextChapterRange(book.currentChapter, book.totalChapters)
      : null;

  const dividers = session.body ? dividersOf(session.body) : [];
  const tocCovered = (chapter: number) => chapter > shown;

  return (
    <Container>
      <div className={styles.top}>
        <BackButton href={bookHref(book.slug)}>Voltar para {book.title}</BackButton>
        <nav aria-label="Caminho">
          <ol className={styles.crumbs}>
            <li>
              <Link href="/">Início</Link>
            </li>
            <li>
              <Link href={bookHref(book.slug)}>{book.title}</Link>
            </li>
            <li aria-current="page">Sessão {session.number}</li>
          </ol>
        </nav>
      </div>

      <div className={styles.layout}>
        <article className={styles.article}>
          <div className={styles.chips}>
            <Chip>Sessão {session.number}</Chip>
            <Chip line>{chaptersText(session)}</Chip>
            {session.membersOnly && <Chip line>Só membros</Chip>}
          </div>
          <h1 className={styles.title}>{session.title}</h1>
          <div className={styles.authorLine}>
            <Avatar name={AUTHOR.name} size="md" />
            <div>
              <b>{AUTHOR.name}</b>
              <div className={styles.meta}>
                {session.publishedAt && <span>{formatFullDate(session.publishedAt)}</span>}
                {session.readMinutes ? <span>{session.readMinutes} min de leitura</span> : null}
                {commentCount > 0 && (
                  <a href="#discussao">
                    {commentCount} {commentCount === 1 ? 'comentário' : 'comentários'}
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className={styles.spoilerBar} data-print="hide">
            <Icon name="eyeOff" />
            <div className={styles.spoilerText}>
              <b>Spoilers até o capítulo {session.chapterTo}.</b>{' '}
              <span>Conte até onde você leu e a gente esconde o resto.</span>
            </div>
            <ProgressPrompt
              bookSlug={book.slug}
              total={book.totalChapters}
              progress={progress}
              embedded
            />
          </div>

          {dividers.length > 0 && (
            <ul className={styles.pills} aria-label="Capítulos desta sessão" data-print="hide">
              {dividers.map((d) => (
                <li key={d.attrs.chapter}>
                  <a href={`#ch-${d.attrs.chapter}`} className={styles.pill}>
                    Capítulo {d.attrs.chapter}
                  </a>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.body}>
            {session.body ? (
              <SessionBody doc={session.body} coverage={{ progress: shown, known }} />
            ) : (
              <p className={styles.unavailable} role="status">
                O texto desta sessão está indisponível agora. Tente de novo em instantes.
              </p>
            )}
          </div>

          {session.rating !== null && (
            <div className={styles.partial}>
              Impressão até aqui <Stars rating={session.rating} />
            </div>
          )}

          {session.notes.length > 0 && (
            <section className={styles.section} aria-labelledby="trechos-titulo">
              <h2 id="trechos-titulo">Trechos e anotações</h2>
              <CoverableBlock
                covered={extrasCovered}
                progress={shown}
                progressKnown={known}
                buttonLabel="Mostrar os trechos e anotações mesmo assim"
                hint={`Eles falam até o capítulo ${session.chapterTo}.`}
              >
                <ul className={styles.noteList}>
                  {session.notes.map((note) => (
                    <li key={note.id}>
                      <blockquote className={styles.note}>
                        <span className={styles.noteKind}>
                          {note.kind === 'quote' ? 'Trecho' : 'Anotação'}
                        </span>
                        {note.kind === 'quote' ? `“${note.text}”` : note.text}
                        {note.reference && <cite>{note.reference}</cite>}
                      </blockquote>
                    </li>
                  ))}
                </ul>
              </CoverableBlock>
            </section>
          )}

          {session.questions.length > 0 && (
            <section className={styles.section} aria-labelledby="perguntas-titulo">
              <h2 id="perguntas-titulo">Perguntas para a discussão</h2>
              <CoverableBlock
                covered={extrasCovered}
                progress={shown}
                progressKnown={known}
                buttonLabel="Mostrar as perguntas mesmo assim"
                hint={`Elas falam até o capítulo ${session.chapterTo}.`}
              >
                <ol className={styles.questions}>
                  {session.questions.map((q) => (
                    <li key={q.id}>
                      <span>{q.text}</span>
                    </li>
                  ))}
                </ol>
              </CoverableBlock>
            </section>
          )}

          <nav className={styles.nav} aria-label="Outras sessões" data-print="hide">
            {older && (
              <Link href={sessionHref(book.slug, older.number)} className={styles.navItem}>
                <Icon name="left" />
                <div>
                  <small>Sessão anterior</small>
                  <b>{older.title}</b>
                </div>
              </Link>
            )}
            {newer ? (
              <Link
                href={sessionHref(book.slug, newer.number)}
                className={`${styles.navItem} ${styles.next}`}
              >
                <div>
                  <small>Próxima sessão</small>
                  <b>{newer.title}</b>
                </div>
                <Icon name="right" />
              </Link>
            ) : (
              upcoming && (
                <div className={`${styles.navItem} ${styles.next} ${styles.soonItem}`}>
                  <div>
                    <small>Próxima sessão</small>
                    <b>
                      {upcoming.from === upcoming.to
                        ? `Capítulo ${upcoming.from}`
                        : `Capítulos ${upcoming.from} a ${upcoming.to}`}
                      , em breve
                    </b>
                  </div>
                </div>
              )
            )}
          </nav>

          {/* A discussão carrega em paralelo ao relato: o texto aparece primeiro. */}
          <Suspense fallback={<DiscussionSkeleton />}>
            <Discussion
              sessionId={session.id}
              bookSlug={book.slug}
              sessionNumber={session.number}
              membersOnly={session.membersOnly}
              commentsOpen={session.commentsOpen}
              chapterFrom={session.chapterFrom}
              chapterTo={session.chapterTo}
              totalChapters={book.totalChapters}
              progress={progress}
              viewer={viewer}
              order={parseCommentOrder(ordem)}
            />
          </Suspense>
        </article>

        <aside className={styles.side} aria-label="Sobre o livro" data-print="hide">
          <div className={styles.sticky}>
            <Link href={bookHref(book.slug)} className={styles.sideBook}>
              <BookCover
                title={book.title}
                author={book.author}
                coverUrl={book.coverUrl}
                width={62}
                fontSize={8}
              />
              <div>
                <b>{book.title}</b>
                <span>{book.author}</span>
              </div>
            </Link>
            {book.currentChapter > 0 && (
              <p className={styles.sideCap}>
                Capítulo {book.currentChapter} de {book.totalChapters}
              </p>
            )}
            <ChapterStrip strip={strip} bookSlug={book.slug} size="compact" />
            {dividers.length > 0 && (
              <nav aria-label="Nesta sessão">
                <h2 className={styles.sideTitle}>Nesta sessão</h2>
                <ul className={styles.toc}>
                  {dividers.map((d) => {
                    const chapter = d.attrs.chapter;
                    const title = !tocCovered(chapter) ? d.attrs.title : null;
                    return (
                      <li key={chapter}>
                        <a href={`#ch-${chapter}`}>
                          <span>{title || `Capítulo ${chapter}`}</span>
                          <small>{chapter}</small>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}
          </div>
        </aside>
      </div>
    </Container>
  );
}
