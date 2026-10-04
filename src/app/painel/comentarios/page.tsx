import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminPage } from '@/components/admin/AdminPage';
import { InstallGate } from '@/components/install/InstallGate';
import { ModerationBoard, type BoardItem } from '@/components/moderacao/ModerationBoard';
import styles from '@/components/moderacao/moderation.module.css';
import { requireRole } from '@/lib/auth/session';
import { getModerationPage } from '@/lib/comments/admin-queries';
import {
  MODERATION_TABS,
  pageCount,
  parseModerationTab,
  parsePageNumber,
  type ModerationTab,
} from '@/lib/comments';
import { formatFullDate, formatRelativeTime } from '@/lib/site';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Comentários' };

const TAB_LABEL: Record<ModerationTab, string> = {
  pendentes: 'Para aprovar',
  aprovados: 'Aprovados',
  removidos: 'Removidos',
};

const EMPTY_TEXT: Record<ModerationTab, string> = {
  pendentes: 'Nada para aprovar por enquanto',
  aprovados: 'Nenhum comentário aprovado ainda',
  removidos: 'Nenhum comentário removido',
};

const tabHref = (tab: ModerationTab, page = 1) =>
  `/painel/comentarios?aba=${tab}${page > 1 ? `&pagina=${page}` : ''}` as never;

export default async function CommentsAdminPage({
  searchParams,
}: PageProps<'/painel/comentarios'>) {
  // A moderadora (`moderator`) também entra: é a única página do painel que ela abre.
  const user = await requireRole('staff');

  const query = await searchParams;
  const tab = parseModerationTab(query.aba);
  const page = parsePageNumber(query.pagina);

  const { items, counts } = await getModerationPage(await createClient(), tab, page);
  const pages = pageCount(counts[tab]);
  if (page > pages) redirect(tabHref(tab, pages));

  const now = new Date();
  const board: BoardItem[] = items.map((item) => ({
    ...item,
    timeText: formatRelativeTime(item.createdAt, now),
    fullDate: formatFullDate(item.createdAt),
  }));

  return (
    <AdminPage>
      {/* A moderadora nunca vê a Visão geral (o `/painel` a manda para cá): o cartão de instalação fica na página dela. */}
      {user.role === 'moderator' && <InstallGate surface="panel" />}
      <div className={styles.toolbar}>
        <nav className={styles.tabs} aria-label="Estado dos comentários">
          {MODERATION_TABS.map((item) => (
            <Link
              key={item}
              href={tabHref(item)}
              className={styles.tab}
              aria-current={item === tab ? 'page' : undefined}
            >
              {TAB_LABEL[item]} <span className={styles.tabCount}>{counts[item]}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className={styles.layout}>
        <section aria-label={TAB_LABEL[tab]}>
          <ModerationBoard items={board} tab={tab} emptyText={EMPTY_TEXT[tab]} />
          {pages > 1 && (
            <nav className={styles.pager} aria-label="Páginas">
              {page > 1 ? <Link href={tabHref(tab, page - 1)}>Página anterior</Link> : <span />}
              <span>
                Página {page} de {pages}
              </span>
              {page < pages ? <Link href={tabHref(tab, page + 1)}>Próxima página</Link> : <span />}
            </nav>
          )}
        </section>

        <aside className={`${styles.card} ${styles.rules}`} aria-labelledby="regras-titulo">
          <h2 id="regras-titulo">Regras de moderação</h2>
          <ul>
            <li>
              Os 3 primeiros comentários de cada membro esperam aprovação. Depois do terceiro
              aprovado, os comentários dela ou dele são publicados direto.
            </li>
            <li>
              Comentário com link (<code>http://</code>, <code>https://</code> ou <code>www.</code>)
              sempre espera aprovação e chega com o alerta &ldquo;Contém link&rdquo;, mesmo de quem
              já é de confiança.
            </li>
            <li>Comentários da administradora e das moderadoras são publicados direto.</li>
            <li>
              Ninguém apaga comentário: remover tira do ar e guarda em &ldquo;Removidos&rdquo;.
              Restaurar devolve para &ldquo;Para aprovar&rdquo;.
            </li>
            <li>
              Spoiler: marque até que capítulo o comentário fala. Quem ainda não leu até lá vê o
              texto coberto.
            </li>
          </ul>
        </aside>
      </div>
    </AdminPage>
  );
}
