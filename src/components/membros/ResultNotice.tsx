import styles from './members.module.css';

/**
 * Resultado da última ação, numa região de status que fica na página (não some quando o diálogo fecha).
 * O texto é sempre uma mensagem fixa em pt-BR: nunca nome nem e-mail.
 */
export function ResultNotice({ result }: { result: { ok: boolean; message: string } | null }) {
  return (
    <div role="status" aria-live="polite">
      {result && (
        <p className={result.ok ? styles.noticeOk : styles.noticeError}>{result.message}</p>
      )}
    </div>
  );
}
