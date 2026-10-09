import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense, type CSSProperties } from 'react';

import { SessionLeaf, type LeafPage } from '@/components/home/SessionLeaf';
import { BookCover, hueFromTitle } from '@/components/livros/BookCover';
import { ChapterLegend, ChapterStrip } from '@/components/public/ChapterStrip';
import { HomeSkeleton } from '@/components/public/Skeleton';
import { ProgressPrompt } from '@/components/public/ProgressPrompt';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { ScrollStrip } from '@/components/ui/ScrollStrip';
import { buildChapterStrip } from '@/lib/chapters';
import { spineFor } from '@/lib/home/spine';
import { loadHome } from '@/lib/public/loaders';
import { bookHref, sessionHref } from '@/lib/routes';
import { SITE_DESCRIPTION, formatDayMonth, isRecent } from '@/lib/site';
import { hsl } from '@/lib/theme/color';

import styles from './home.module.css';

export const metadata: Metadata = { description: SITE_DESCRIPTION };

/** Sessões no sumário e na página que folheia; o resto fica em "Ver todas". */
const HOME_SESSIONS = 8;
/** Lombadas na estante da home. */
const HOME_SPINES = 10;

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

/*
 * "A página aberta" (impeccable overdrive): o livro atual aberto no topo. Na página da esquerda, a capa, o título e
 * onde a Agatha está, com a fita de capítulos no pé; na da direita, a sessão mais recente impressa como página, e as
 * anteriores a uma virada de folha (`SessionLeaf`). Uma fita marcadora corre pelo miolo. Embaixo, o sumário das
 * sessões, a nota na margem ("Seu progresso") e a estante em lombadas.
 */
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
  const listed = sessions.slice(0, HOME_SESSIONS);
  const now = new Date();
  const pages: LeafPage[] = listed.map((s) => ({
    id: s.id,
    number: s.number,
    title: s.title,
    chapterFrom: s.chapterFrom,
    chapterTo: s.chapterTo,
    date: s.publishedAt ? formatDayMonth(s.publishedAt) : null,
    excerpt: s.excerpt,
    href: sessionHref(book.slug, s.number),
    membersOnly: s.membersOnly,
  }));
  const nextNumber = (sessions[0]?.number ?? 0) + 1;

  return (
    <>
      <section className={styles.stage} aria-label="Leitura atual">
        <Container>
          <div className={styles.spread}>
            <div className={styles.left}>
              <p className={styles.running}>Lendo agora</p>
              <div className={styles.frontis}>
                <div className={styles.cover}>
                  <BookCover
                    title={book.title}
                    author={book.author}
                    coverUrl={book.coverUrl}
                    width={168}
                    fontSize={19}
                    priority
                  />
                </div>
                <div className={styles.titleBlock}>
                  <h1 className={styles.title}>{book.title}</h1>
                  <p className={styles.by}>de {book.author}</p>
                </div>
              </div>
              <div className={styles.foot}>
                <p className={styles.where}>
                  {book.currentChapter > 0 ? (
                    <>
                      A Agatha está no <b>capítulo {book.currentChapter}</b> de {book.totalChapters}
                      .
                    </>
                  ) : (
                    'A Agatha está começando a leitura.'
                  )}
                </p>
                <ChapterStrip strip={strip} bookSlug={book.slug} links={false} />
                <ChapterLegend
                  hasSessions={sessions.length > 0}
                  hasNext={strip.nextRange !== null}
                />
              </div>
            </div>

            <SessionLeaf pages={pages} aboutHref={bookHref(book.slug)} />
          </div>
        </Container>
      </section>

      <Container>
        <div className={styles.lower}>
          <section aria-labelledby="sumario-titulo" className={styles.toc}>
            <div className={styles.secHead}>
              <h2 id="sumario-titulo" className={styles.h2}>
                Sumário
              </h2>
              {sessions.length > listed.length && (
                <Link href="/sessoes" className={styles.more}>
                  Ver todas
                </Link>
              )}
            </div>
            <ol className={styles.tocList}>
              {listed.map((s, index) => (
                <li key={s.id} className={index === 0 ? styles.latest : undefined}>
                  <Link href={sessionHref(book.slug, s.number)} className={styles.entry}>
                    <span className={styles.num}>Sessão {s.number}</span>
                    <span className={styles.entryTitle}>{s.title}</span>
                    <span className={styles.leader} aria-hidden="true" />
                    <span className={styles.chapters}>
                      cap. {s.chapterFrom}–{s.chapterTo}
                    </span>
                    <span className={styles.entryMeta}>
                      {isRecent(s.publishedAt, now) && <b>Nova · </b>}
                      {s.publishedAt && formatDayMonth(s.publishedAt)}
                      {s.membersOnly && ' · só para membros'}
                      {s.commentCount > 0 &&
                        ` · ${s.commentCount} ${s.commentCount === 1 ? 'comentário' : 'comentários'}`}
                    </span>
                  </Link>
                </li>
              ))}
              {strip.nextRange && (
                <li className={styles.upcoming}>
                  <span className={styles.entry}>
                    <span className={styles.num}>Sessão {nextNumber}</span>
                    <span className={styles.entryTitle}>A Agatha ainda está lendo</span>
                    <span className={styles.leader} aria-hidden="true" />
                    <span className={styles.chapters}>
                      cap. {strip.nextRange.from}–{strip.nextRange.to}
                    </span>
                  </span>
                </li>
              )}
            </ol>
          </section>

          <aside className={styles.margin} aria-label="Na margem" data-print="hide">
            <section className={styles.note} aria-labelledby="progresso-titulo">
              <h2 id="progresso-titulo" className={styles.noteTitle}>
                Seu progresso
              </h2>
              <p className={styles.noteText}>Conte até onde você leu e a gente esconde o resto.</p>
              <ProgressPrompt
                bookSlug={book.slug}
                total={book.totalChapters}
                progress={progress}
                embedded
              />
            </section>
            {!viewer && (
              <p className={styles.join}>
                Quer guardar onde parou e conversar nas sessões?{' '}
                <Link href="/entrar">Entre no clube</Link>.
              </p>
            )}
          </aside>
        </div>

        {finished.length > 0 && (
          <section aria-labelledby="estante-titulo" className={styles.shelfSection}>
            <div className={styles.secHead}>
              <h2 id="estante-titulo" className={styles.h2}>
                Da estante
              </h2>
              <Link href="/estante" className={styles.more}>
                Ver estante
              </Link>
            </div>
            <ScrollStrip as="div" className={styles.shelfScroll}>
              <ul className={styles.shelf}>
                {finished.slice(0, HOME_SPINES).map((b) => {
                  const spine = spineFor(b.title);
                  const hue = hueFromTitle(b.title);
                  const style = {
                    '--spine-h': `${spine.height}px`,
                    '--spine-w': `${spine.width}px`,
                    '--spine-font': `${spine.fontSize}px`,
                    '--spine-c0': hsl(hue, 0.42, 0.82),
                    '--spine-c1': hsl(hue, 0.4, 0.72),
                    '--spine-ink': hsl(hue, 0.4, 0.2),
                  } as CSSProperties;
                  return (
                    <li key={b.id} style={style}>
                      <Link
                        href={bookHref(b.slug)}
                        className={styles.spine}
                        aria-label={`${b.title}, de ${b.author}`}
                      >
                        <span className={styles.spineTitle}>{b.title}</span>
                        <span className={styles.spineAuthor}>{b.author}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </ScrollStrip>
          </section>
        )}
      </Container>
    </>
  );
}
