import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import styles from '@/components/auth/auth.module.css';
import { GoogleMark } from '@/components/auth/GoogleMark';
import { PageHeader } from '@/components/site/PageHeader';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Icon } from '@/components/ui/Icon';
import { safeNext } from '@/lib/auth/safe-next';
import { getCurrentUser } from '@/lib/auth/session';
import { signInPageErrorMessage } from '@/lib/auth/sign-in-errors';

import { signInWithGoogle } from './actions';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = { title: 'Entrar', robots: { index: false } };

export default async function SignInPage({ searchParams }: PageProps<'/entrar'>) {
  const params = await searchParams;
  const next = safeNext(params.next);

  if (await getCurrentUser()) redirect(next);

  // Só códigos da lista fixa; o valor recebido nunca aparece na página.
  const pageError = signInPageErrorMessage(params.erro);

  return (
    <Container>
      <PageHeader
        back={{ href: '/', label: 'Voltar para o início' }}
        title="Entre para o clube"
        lead="Comente as sessões, vote no próximo livro e receba as novidades."
      />
      <div className={styles.wrap}>
        <div className={styles.card}>
          {pageError && (
            <p className={styles.error} role="alert">
              <Icon name="x" size="sm" />
              {pageError}
            </p>
          )}
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="ghost" block>
              <GoogleMark />
              Continuar com Google
            </Button>
          </form>
          <p className={styles.or}>ou</p>
          <SignInForm next={next} />
        </div>
      </div>
    </Container>
  );
}
