import type { MembersStats as Stats } from '@/lib/members/queries';

import styles from './members.module.css';

const show = (value: number | null) => (value === null ? '—' : value.toLocaleString('pt-BR'));

/** Os quatro números do topo: todos contados no banco; "—" quando a contagem falhou. Nada inventado. */
export function MembersStats({ stats }: { stats: Stats }) {
  const items = [
    { label: 'Membros', value: stats.total },
    { label: 'Equipe', value: stats.staff },
    { label: 'Comentários suspensos', value: stats.suspended },
    { label: 'Novos em 7 dias', value: stats.recent },
  ];
  return (
    <dl className={styles.stats} data-tour="members-stats">
      {items.map((item) => (
        <div key={item.label} className={styles.stat}>
          <dt>{item.label}</dt>
          <dd>{show(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
