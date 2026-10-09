import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';

import styles from './SiteHeader.module.css';

/** Cabeçalho enquanto o menu e a conta carregam: só a marca, no mesmo lugar e na mesma altura. */
export function SiteHeaderSkeleton() {
  return (
    <header className={styles.header} data-print="hide">
      <Container>
        <div className={styles.inner}>
          <Logo className={styles.logo} />
        </div>
      </Container>
    </header>
  );
}
