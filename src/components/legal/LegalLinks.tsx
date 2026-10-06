import Link from 'next/link';

import { legalConfig } from '@/content/legal-config';

import styles from './LegalLinks.module.css';

/**
 * "Ao entrar, você concorda com os Termos e a Política de Privacidade e declara ter 18 anos ou mais." (login).
 * A idade vem de `legal-config.ts` e é uma DECLARAÇÃO da pessoa: o site não a verifica nem a confirma.
 */
export function LegalLinks({ verb }: { verb: 'entrar' | 'continuar' }) {
  return (
    <p className={styles.note}>
      Ao {verb}, você concorda com os <Link href="/termos">Termos</Link> e a{' '}
      <Link href="/privacidade">Política de Privacidade</Link>
      {verb === 'entrar' ? ` e declara ter ${legalConfig.minimumAge} anos ou mais` : ''}.
    </p>
  );
}
