import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';
import { isStaff, panelHomeFor } from '@/lib/auth/roles';
import { getCurrentUser } from '@/lib/auth/session';

import { AccountMenu } from './AccountMenu';
import styles from './SiteHeader.module.css';
import { SiteNav } from './SiteNav';

export async function SiteHeader({ currentBookSlug }: { currentBookSlug: string }) {
  const user = await getCurrentUser();

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
