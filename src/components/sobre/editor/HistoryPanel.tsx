'use client';

import { Button } from '@/components/ui/Button';
import type { HistoryItem } from '@/lib/about/outcomes';
import { formatDateTime } from '@/lib/site';

import styles from './aboutEditor.module.css';

const KIND_LABEL: Record<HistoryItem['kind'], string> = {
  publish: 'Publicação',
  restore: 'Restauração',
};

/**
 * O histórico: as últimas 20 versões que foram ao ar. A primeira é a que está no ar agora; as outras podem ser
 * restauradas (a confirmação e a chamada ficam no `AboutEditor`). Restaurar publica a versão e a coloca no rascunho.
 */
export function HistoryPanel({
  items,
  disabled,
  onRestore,
}: {
  items: readonly HistoryItem[];
  disabled?: boolean;
  onRestore: (item: HistoryItem) => void;
}) {
  return (
    <section className={styles.card} aria-labelledby="sobre-historico" data-tour="about-history">
      <h2 id="sobre-historico">Histórico de versões</h2>
      <p className={styles.hint}>
        As últimas 20 versões publicadas. Restaurar uma versão a publica na hora e a coloca no
        rascunho.
      </p>
      {items.length === 0 ? (
        <p className={styles.hint}>Nada foi publicado ainda.</p>
      ) : (
        <ol className={styles.items}>
          {items.map((item, index) => (
            <li key={item.id} className={styles.item} data-history-id={item.id}>
              <div className={styles.itemHead}>
                <h3>
                  {formatDateTime(item.publishedAt)}
                  {index === 0 ? ' · no ar agora' : ''}
                </h3>
                {index > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Restaurar a versão de ${formatDateTime(item.publishedAt)}`}
                    onClick={() => onRestore(item)}
                  >
                    Restaurar
                  </Button>
                )}
              </div>
              <p className={styles.hint}>
                {KIND_LABEL[item.kind]} por {item.byName ?? 'uma conta que já não existe'}
                {item.title ? ` · “${item.title}”` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
