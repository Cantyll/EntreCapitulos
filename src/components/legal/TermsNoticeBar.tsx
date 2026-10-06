'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { legalConfig } from '@/content/legal-config';
import { safeNext } from '@/lib/auth/safe-next';
import { acceptHref, isNoticeHiddenPath } from '@/lib/terms';

import styles from './terms-notice.module.css';

type Props = {
  /** `missing`: nunca aceitou. `outdated`: aceitou uma versão anterior. */
  status: 'missing' | 'outdated';
  /** Conta da equipe: isenta de aceitar para comentar, mas vê o aviso. */
  staff: boolean;
};

/**
 * A faixa do aviso. É um Client Component só para saber a página atual: o layout não renderiza de novo a cada
 * navegação, então o destino de volta (`next`) e a regra "não aparece em /entrar nem em /boas-vindas" saem de
 * `usePathname()`. O texto não diz que a idade foi verificada: é uma declaração da pessoa.
 */
export function TermsNoticeBar({ status, staff }: Props) {
  const pathname = usePathname();
  if (isNoticeHiddenPath(pathname)) return null;

  const href = acceptHref(safeNext(pathname));
  const text =
    status === 'outdated'
      ? 'Atualizamos os Termos de Uso e a Política de Privacidade. Leia e aceite de novo quando puder.'
      : staff
        ? `Falta aceitar os Termos de Uso e a Política de Privacidade (inclui declarar ter ${legalConfig.minimumAge} anos ou mais).`
        : `Aceite os Termos de Uso e a Política de Privacidade (inclui declarar ter ${legalConfig.minimumAge} anos ou mais). Sem isso você pode ler, mas não pode comentar.`;

  return (
    <div
      className={styles.bar}
      role="region"
      aria-label="Aviso sobre os Termos"
      data-terms-notice={status}
    >
      <p className={styles.text}>{text}</p>
      <Link className={styles.link} href={href as Route}>
        {status === 'outdated' ? 'Ler e aceitar' : 'Aceitar os Termos'}
      </Link>
    </div>
  );
}
