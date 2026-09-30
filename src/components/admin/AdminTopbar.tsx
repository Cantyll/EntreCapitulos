import { Icon } from '@/components/ui/Icon';
import { IconLink } from '@/components/ui/IconButton';

import { AdminTitle } from './AdminTitle';
import styles from './AdminTopbar.module.css';

export function AdminTopbar({ pendingComments }: { pendingComments: number }) {
  const bellLabel =
    pendingComments > 0
      ? `Notificações: ${pendingComments} ${pendingComments === 1 ? 'comentário espera' : 'comentários esperam'} aprovação`
      : 'Notificações';

  return (
    <header className={styles.top}>
      <AdminTitle className={styles.title} />
      {/* Sem função até a Fase 3 (busca), como o campo do protótipo. */}
      <label className={styles.search}>
        <Icon name="search" size="sm" />
        <input
          type="text"
          role="searchbox"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Buscar sessões, membros ou comentários"
          aria-label="Buscar"
        />
      </label>
      <IconLink href="/painel/comentarios" label={bellLabel} dot={pendingComments > 0}>
        <Icon name="bell" />
      </IconLink>
    </header>
  );
}
