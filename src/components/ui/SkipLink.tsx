import styles from './SkipLink.module.css';

/** Primeiro item focável da página; leva direto ao <main id="conteudo">. */
export function SkipLink() {
  return (
    <a className={styles.skip} href="#conteudo" data-print="hide">
      Pular para o conteúdo
    </a>
  );
}
