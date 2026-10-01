import { unstable_rethrow } from 'next/navigation';

import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';
import { isAuthFailure } from '@/lib/auth/failure';
import { logAuthFailure } from '@/lib/auth/log';
import { isStaff, panelHomeFor } from '@/lib/auth/roles';
import { getCurrentUser, type CurrentUser } from '@/lib/auth/session';

import { AccountMenu } from './AccountMenu';
import styles from './SiteHeader.module.css';
import { SiteNav } from './SiteNav';

/**
 * O cabeçalho aparece em todas as páginas públicas, então um Supabase mal configurado ou fora do ar
 * não pode derrubá-las: nesse caso a pessoa vê o site como visitante (Entrar / Participar). Só a
 * configuração e as falhas do Auth caem aqui. `requireUser` e `requireRole` continuam falhando
 * fechado, e qualquer outro erro segue para o Next.
 */
async function currentUserOrNull(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch (error) {
    // Os erros internos do Next (renderização dinâmica, redirect, notFound) não são falhas: o
    // Next precisa recebê-los de volta para continuar a renderização.
    unstable_rethrow(error);
    if (!isAuthFailure(error)) throw error;
    logAuthFailure('SiteHeader: getCurrentUser', error);
    return null;
  }
}

export async function SiteHeader({ currentBookSlug }: { currentBookSlug: string }) {
  const user = await currentUserOrNull();

  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.inner}>
          <Logo className={styles.logo} />
          <SiteNav currentBookSlug={currentBookSlug} />
          <div className={styles.actions}>
            {user ? (
              <AccountMenu
                displayName={user.displayName}
                panelHref={isStaff(user.role) ? panelHomeFor(user.role) : undefined}
              />
            ) : (
              <>
                <ButtonLink href="/entrar" variant="ghost" size="sm">
                  Entrar
                </ButtonLink>
                <ButtonLink href="/entrar" size="sm">
                  Participar
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
}
