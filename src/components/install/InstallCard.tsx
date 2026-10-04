'use client';

import { Button } from '@/components/ui/Button';
import { INSTALL_CARD, INSTALL_HINT } from '@/content/install';
import { cx } from '@/lib/cx';
import type { InstallSurface, InstallView } from '@/lib/pwa/install-state';

import styles from './install.module.css';
import { InstallSteps } from './InstallSteps';

type Props = {
  view: InstallView;
  /** No painel o cartão ocupa a coluna da página, sem a centralização do site público. */
  surface: InstallSurface;
  onLater: () => void;
  onInstalled: () => void;
};

/**
 * O cartão com os passos (Safari do iPhone e do iPad) ou, em navegador embutido de aplicativo, só a dica "abra no
 * Safari". Sem foco automático, sem animação e sem armadilha de foco: é um bloco comum da página.
 */
export function InstallCard({ view, surface, onLater, onInstalled }: Props) {
  if (view === 'hint') {
    return (
      <section
        className={cx(styles.hint, surface === 'panel' && styles.panel)}
        role="region"
        aria-label={INSTALL_HINT.regionLabel}
        data-install-card="hint"
      >
        <p>{INSTALL_HINT.text}</p>
        <Button variant="soft" size="lg" onClick={onLater}>
          {INSTALL_HINT.later}
        </Button>
      </section>
    );
  }
  return (
    <section
      className={cx(styles.card, surface === 'panel' && styles.panel)}
      role="region"
      aria-label={INSTALL_CARD.regionLabel}
      data-install-card="card"
    >
      <div className={styles.text}>
        <h2>{INSTALL_CARD.title}</h2>
        <p>{INSTALL_CARD.lead}</p>
      </div>
      <InstallSteps />
      <div className={styles.actions}>
        <Button variant="soft" size="lg" onClick={onLater}>
          {INSTALL_CARD.later}
        </Button>
        <Button variant="ghost" size="lg" onClick={onInstalled}>
          {INSTALL_CARD.installed}
        </Button>
      </div>
    </section>
  );
}
