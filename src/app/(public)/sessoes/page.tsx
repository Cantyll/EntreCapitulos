import type { Metadata } from 'next';
import Link from 'next/link';

import { SessionCard } from '@/components/public/SessionCard';
import { Container } from '@/components/ui/Container';
import { getVisibleSessions, loadShelf } from '@/lib/public/loaders';
import { parseBookParam } from '@/lib/public/params';
import { isRecent } from '@/lib/site';
import { getBooks } from '@/lib/public/queries';

import styles from '../shelf.module.css';

export const metadata: Metadata = {
  title: 'Sessões de leitura',
  description: 'Cada sessão cobre alguns capítulos, com o relato da Agatha.',
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SessionsPage({ searchParams }: Props) {
  const [params, books, shelf] = await Promise.all([searchParams, getBooks(), loadShelf()]);

  // Abas: o livro em leitura e os terminados que têm sessão pública. Livro sem sessão não vira aba.
  const current = books.find((b) => b.status === 'reading') ?? null;
  const tabs = [
    ...(current ? [current] : []),
    ...shelf.finished.filter((b) => (shelf.counts.get(b.id) ?? 0) > 0),
  ];
  const selected =
    tabs.find(
      (b) =>
        b.slug ===
        parseBookParam(
          params.livro,
          tabs.map((t) => t.slug),
        ),
    ) ??
    tabs[0] ??
    null;

  const sessions = selected ? await getVisibleSessions(selected.id) : [];
  const now = new Date();

  return (
    <Container>
      <section className={styles.hero}>
        <h1>Sessões de leitura</h1>
        <p>Cada sessão cobre alguns capítulos, com o relato da Agatha.</p>
      </section>

      {tabs.length > 1 && (
        <nav className={styles.tabs} aria-label="Livros">
          {tabs.map((book) => {
            const count =
              book.id === selected?.id ? sessions.length : (shelf.counts.get(book.id) ?? 0);
            return (
              <Link
                key={book.id}
                href={
                  (book.id === tabs[0]!.id ? '/sessoes' : `/sessoes?livro=${book.slug}`) as never
                }
                className={styles.tab}
                aria-current={book.id === selected?.id ? 'page' : undefined}
              >
                {book.title}
                {count > 0 && <small>{count}</small>}
              </Link>
            );
          })}
        </nav>
      )}

      {selected && sessions.length > 0 ? (
        <div className={styles.list}>
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              bookSlug={selected.slug}
              isNew={isRecent(session.publishedAt, now)}
              headingLevel={2}
            />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>
          {selected?.status === 'reading'
            ? 'A primeira sessão sai em breve.'
            : 'Ainda não há sessões publicadas.'}
        </p>
      )}
    </Container>
  );
}
