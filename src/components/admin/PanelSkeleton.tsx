import styles from './PanelSkeleton.module.css';

/*
 * Esqueleto do miolo das páginas do painel (o menu e o topo já estão na tela). Só formas cinzas no lugar certo, sem
 * texto inventado. O aviso "Carregando" é só para leitor de tela.
 */
export function PanelSkeleton({ variant = 'list' }: { variant?: 'list' | 'editor' }) {
  return (
    <div className={styles.frame} aria-busy="true">
      <p className={styles.sr} role="status">
        Carregando…
      </p>
      <span className={styles.bar} style={{ width: '38%', height: 22 }} aria-hidden="true" />
      {variant === 'editor' ? (
        <>
          <span className={styles.bar} style={{ width: '100%', height: 46 }} aria-hidden="true" />
          <span className={styles.bar} style={{ width: '100%', height: 280 }} aria-hidden="true" />
        </>
      ) : (
        <div className={styles.rows} aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={styles.row}>
              <span className={styles.bar} style={{ width: '46%', height: 16 }} />
              <span className={styles.bar} style={{ width: '24%', height: 12 }} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
