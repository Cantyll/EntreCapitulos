import { DELETED_ACCOUNT_LABEL, describeAuditEntry } from '@/lib/members';
import type { MemberAudit } from '@/lib/members/queries';
import { formatDateTime } from '@/lib/site';

import styles from './members.module.css';

/** As últimas 50 linhas da auditoria SOBRE a pessoa. Cada linha diz o que foi feito, por quem e quando. */
export function AuditList({ audit }: { audit: MemberAudit }) {
  return (
    <section
      className={`${styles.card} ${styles.section}`}
      aria-labelledby="auditoria-titulo"
      data-tour="member-audit"
    >
      <h2 id="auditoria-titulo">Auditoria</h2>
      {audit.status === 'pending' && <p>Falta aplicar a atualização do banco (Database deploy).</p>}
      {audit.status === 'error' && <p>Não foi possível carregar a auditoria agora.</p>}
      {audit.status === 'ok' && audit.entries.length === 0 && (
        <p>Nenhuma ação da administração sobre esta pessoa.</p>
      )}
      {audit.status === 'ok' && audit.entries.length > 0 && (
        <>
          <p>
            As últimas {audit.entries.length === 1 ? 'ação' : 'ações'} da administração sobre esta
            pessoa.
          </p>
          <ol className={styles.audit}>
            {audit.entries.map((entry) => (
              <li key={entry.id}>
                <span>{describeAuditEntry(entry)}</span>
                <span className={styles.auditWho}>
                  por {entry.actorName ?? DELETED_ACCOUNT_LABEL}
                </span>
                <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
