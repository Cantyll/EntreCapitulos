import Link from 'next/link';

import styles from './LegalLinks.module.css';

/** "Ao entrar, você concorda com os Termos e a Política de Privacidade." (login e primeiro acesso). */
export function LegalLinks({ verb }: { verb: 'entrar' | 'continuar' }) {
  return (
    <p className={styles.note}>
      Ao {verb}, você concorda com os <Link href="/termos">Termos</Link> e a{' '}
      <Link href="/privacidade">Política de Privacidade</Link>.
    </p>
  );
}
