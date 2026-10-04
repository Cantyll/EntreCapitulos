import { INSTALL_GUIDE } from '@/content/install';

import styles from './install.module.css';
import { InstallSteps } from './InstallSteps';

/**
 * Passos ilustrados e as observações que valem para mais de uma versão do iOS. Aparece em /sobre ("Leia como
 * aplicativo", para todos, como informação) e em /conta ("Instalar no iPhone", só no Safari do iOS fora do app).
 */
export function InstallGuide({ variant }: { variant: 'about' | 'account' }) {
  const copy = INSTALL_GUIDE[variant];
  const titleId = `install-guide-${variant}`;
  return (
    <section className={styles.guide} aria-labelledby={titleId} data-install-guide={variant}>
      <h2 id={titleId}>{copy.title}</h2>
      <p className={styles.lead}>{copy.lead}</p>
      <InstallSteps />
      <ul className={styles.notes}>
        {INSTALL_GUIDE.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
