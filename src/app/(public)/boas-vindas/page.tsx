import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import styles from '@/components/auth/auth.module.css';
import { PageHeader } from '@/components/site/PageHeader';
import { Container } from '@/components/ui/Container';
import { suggestedDisplayName } from '@/lib/auth/display-name';
import { safeNext } from '@/lib/auth/safe-next';
import { requireUser } from '@/lib/auth/session';

import { DisplayNameForm } from './DisplayNameForm';

export const metadata: Metadata = { title: 'Boas-vindas', robots: { index: false } };

/**
 * Primeiro acesso: a pessoa escolhe o nome público. Sem esse passo o banco não deixa comentar
 * (profile_incomplete), mas dá para seguir só lendo.
 */
export default async function WelcomePage({ searchParams }: PageProps<'/boas-vindas'>) {
  const user = await requireUser();
  const next = safeNext((await searchParams).next);
  if (user.nameConfirmed) redirect(next);

  return (
    <Container>
      <PageHeader title="Boas-vindas ao clube" />
      <div className={styles.wrap}>
        <div className={styles.card}>
          <h2>Como devemos chamar você nos comentários?</h2>
          <DisplayNameForm suggestion={suggestedDisplayName(user.displayName)} next={next} />
        </div>
      </div>
    </Container>
  );
}
