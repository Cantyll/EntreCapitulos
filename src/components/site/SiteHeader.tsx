import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';
import { hasRole, MODERATION_HREF, ROLE_LABELS } from '@/lib/auth/roles';
import { getCurrentUser } from '@/lib/auth/session';

import { AccountMenu } from './AccountMenu';
import styles from './SiteHeader.module.css';
import { SiteNav } from './SiteNav';

export async function SiteHeader({ currentBookSlug }: { currentBookSlug: string }) {
  const user = await getCurrentUser();
  const staff = user !== null && hasRole(user.role, 'staff');

  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.inner}>
          <Logo className={styles.logo} />
          <SiteNav currentBookSlug={currentBookSlug} />
          <div className={styles.actions}>
            {user ? (
              <AccountMenu
                name={user.displayName}
                roleLabel={staff ? ROLE_LABELS[user.role] : undefined}
                panelHref={
                  staff ? (user.role === 'admin' ? '/painel' : MODERATION_HREF) : undefined
                }
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
