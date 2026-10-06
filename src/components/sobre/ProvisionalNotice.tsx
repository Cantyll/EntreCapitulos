import Link from 'next/link';

import styles from './provisional.module.css';

/**
 * Aviso SÓ para a administração, enquanto a página Sobre nunca foi publicada: o site mostra o texto provisório de
 * código. Some depois da primeira publicação (quem decide é `isAboutPublished`, uma leitura simples: se falhar, nada
 * aparece). Na Visão geral ele traz o link para a página; em `/painel/sobre` o link não é preciso.
 */
export function ProvisionalNotice({ withLink }: { withLink?: boolean }) {
  return (
    <aside className={styles.notice} aria-label="Aviso" data-about-provisional="">
      <p>
        <b>A página Sobre ainda usa o texto provisório.</b> Edite e publique antes do lançamento.
      </p>
      {withLink && (
        <Link href="/painel/sobre" className={styles.link}>
          Abrir a página Sobre
        </Link>
      )}
    </aside>
  );
}
