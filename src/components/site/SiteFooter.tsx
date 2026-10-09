import Link from 'next/link';

import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';
import { SITE_TAGLINE } from '@/lib/site';

import styles from './SiteFooter.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.inner}>
          <Logo size="sm" />
          <nav className={styles.nav} aria-label="Rodapé" data-print="hide">
            <Link href="/sessoes">Sessões</Link>
            <Link href="/estante">Estante</Link>
            <Link href="/sobre">Regras da comunidade</Link>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos</Link>
          </nav>
          <span>{SITE_TAGLINE}</span>
        </div>
      </Container>
    </footer>
  );
}
