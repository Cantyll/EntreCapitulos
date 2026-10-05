import Link from 'next/link';

import {
  MEMBER_FILTERS,
  MEMBER_FILTER_LABELS,
  memberListHref,
  type MemberFilter,
} from '@/lib/members';
import type { MembersStats } from '@/lib/members/queries';

import styles from './members.module.css';

/** Filtros Todos, Equipe, Suspensos e Novos. Cada um mantém a busca por nome; a página volta para a 1. */
export function MembersFilters({
  active,
  search,
  stats,
}: {
  active: MemberFilter;
  search: string;
  stats: MembersStats;
}) {
  const counts: Record<MemberFilter, number | null> = {
    todos: stats.total,
    equipe: stats.staff,
    suspensos: stats.suspended,
    novos: stats.recent,
  };
  return (
    <nav className={styles.tabs} aria-label="Filtrar membros" data-tour="members-filters">
      {MEMBER_FILTERS.map((filter) => (
        <Link
          key={filter}
          href={memberListHref({ filter, search }) as never}
          className={styles.tab}
          aria-current={filter === active ? 'page' : undefined}
        >
          {MEMBER_FILTER_LABELS[filter]}{' '}
          <span className={styles.tabCount}>
            {counts[filter] === null ? '—' : counts[filter]!.toLocaleString('pt-BR')}
          </span>
        </Link>
      ))}
    </nav>
  );
}
