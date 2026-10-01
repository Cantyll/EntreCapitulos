import { PROGRESS_PROMPT } from '@/lib/spoiler';

import styles from './ProgressPrompt.module.css';
import { ProgressSelect } from './ProgressSelect';

/**
 * O seletor de progresso, com a pergunta "Até que capítulo você leu?" por cima quando a pessoa ainda
 * não disse (progresso desconhecido). Depois de escolher, fica só o seletor.
 */
export function ProgressPrompt({
  bookSlug,
  total,
  progress,
  label,
}: {
  bookSlug: string;
  total: number;
  progress: number | null;
  label?: string;
}) {
  if (progress !== null) {
    return <ProgressSelect bookSlug={bookSlug} total={total} progress={progress} label={label} />;
  }
  return (
    <div className={styles.prompt}>
      <p className={styles.question}>{PROGRESS_PROMPT}</p>
      <p className={styles.help}>
        Os capítulos depois do que você leu ficam cobertos até você mostrar. Escolha para começar.
      </p>
      <ProgressSelect bookSlug={bookSlug} total={total} progress={null} label="Li até o" />
    </div>
  );
}
