import { PROGRESS_PROMPT } from '@/lib/spoiler';

import styles from './ProgressPrompt.module.css';
import { ProgressSelect } from './ProgressSelect';

/**
 * O seletor de progresso, com a pergunta "Até que capítulo você leu?" por cima quando a pessoa ainda
 * não disse (progresso desconhecido). Depois de escolher, fica só o seletor. `embedded`: dentro de um
 * cartão ou faixa que já tem fundo e borda (a lateral da home, a faixa de spoiler da sessão), a pergunta
 * perde a caixa própria e fica separada por um filete, para não virar um cartão dentro de outro.
 */
export function ProgressPrompt({
  bookSlug,
  total,
  progress,
  label,
  embedded = false,
}: {
  bookSlug: string;
  total: number;
  progress: number | null;
  label?: string;
  embedded?: boolean;
}) {
  if (progress !== null) {
    return <ProgressSelect bookSlug={bookSlug} total={total} progress={progress} label={label} />;
  }
  return (
    <div className={embedded ? `${styles.prompt} ${styles.embedded}` : styles.prompt}>
      <p className={styles.question}>{PROGRESS_PROMPT}</p>
      <p className={styles.help}>
        Os capítulos depois do que você leu ficam cobertos até você mostrar. Escolha para começar.
      </p>
      <ProgressSelect bookSlug={bookSlug} total={total} progress={null} label="Li até o" />
    </div>
  );
}
