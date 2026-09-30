import Link from 'next/link';

import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';

import styles from './SiteFooter.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.inner}>
          <Logo size="sm" />
          <nav className={styles.nav} aria-label="Rodapé">
            <Link href="/sobre">Regras da comunidade</Link>
            <Link href="/#receber-por-email">Receber por e-mail</Link>
            <Link href="/estante">Estante</Link>
          </nav>
          <span>Um clube de leitura em sessões, feito com carinho.</span>
        </div>
      </Container>
    </footer>
  );
}
