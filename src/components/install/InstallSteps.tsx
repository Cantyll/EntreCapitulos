import { INSTALL_STEPS, type InstallStep } from '@/content/install';
import { cx } from '@/lib/cx';

import styles from './install.module.css';
import { AddGlyph, ConfirmGlyph, ShareGlyph } from './InstallIcons';

const GLYPHS: Record<InstallStep['id'], typeof ShareGlyph> = {
  share: ShareGlyph,
  add: AddGlyph,
  confirm: ConfirmGlyph,
};

/** Os três passos, com a ilustração de cada um. O mesmo no cartão e nas seções de /sobre e /conta. */
export function InstallSteps({ className }: { className?: string }) {
  return (
    // `role="list"`: o Safari tira a semântica de lista de uma lista com `list-style: none`.
    <ol className={cx(styles.steps, className)} role="list">
      {INSTALL_STEPS.map((step) => {
        const Glyph = GLYPHS[step.id];
        return (
          <li key={step.id}>
            <span className={styles.glyph}>
              <Glyph className={styles.glyphSvg} />
            </span>
            <span>{step.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
