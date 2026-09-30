import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';

import styles from './SiteHeader.module.css';
import { SiteNav } from './SiteNav';

export function SiteHeader({ currentBookSlug }: { currentBookSlug: string }) {
  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.inner}>
          <Logo className={styles.logo} />
          <SiteNav currentBookSlug={currentBookSlug} />
          <div className={styles.actions}>
            <ButtonLink href="/entrar" variant="ghost" size="sm">
              Entrar
            </ButtonLink>
            <ButtonLink href="/entrar" size="sm">
              Participar
            </ButtonLink>
          </div>
        </div>
      </Container>
    </header>
  );
}
