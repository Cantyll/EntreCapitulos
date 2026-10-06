import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { AboutEditor } from '@/components/sobre/editor/AboutEditor';
import { requireRole } from '@/lib/auth/session';
import { aboutFacts } from '@/lib/about';
import { loadAboutEditorState } from '@/lib/about/service';
import { loadShelf } from '@/lib/public/loaders';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/site';

export const metadata: Metadata = { title: 'Página Sobre' };

/**
 * Painel > Página Sobre: o editor do conteúdo de `/sobre` (só a administração; a moderação e os membros recebem 403).
 * Lê o rascunho, o publicado e o histórico sob o RLS da administração. Sem a migration aplicada (ou se a leitura
 * falhar), mostra um aviso em vez do editor: `/sobre` continua mostrando o texto de código.
 */
export default async function AboutAdminPage() {
  await requireRole('admin');

  const supabase = await createClient();
  const [state, shelf] = await Promise.all([loadAboutEditorState(supabase), loadShelf()]);

  if (!state.available) {
    return (
      <AdminPage back={{ href: '/painel', label: 'Voltar para a Visão geral' }}>
        <p role="alert">
          Não foi possível carregar a página Sobre agora. Pode ser que falte aplicar a atualização
          do banco (Database deploy: veja o README). Enquanto isso, <b>/sobre</b> continua mostrando
          o texto padrão do site.
        </p>
      </AdminPage>
    );
  }

  // Os mesmos números da página pública (só os que não são zero), para a pré-visualização.
  const sessions = [...shelf.counts.values()].reduce((sum, n) => sum + n, 0);
  const facts = aboutFacts(shelf.finished.length, sessions);

  return (
    <AdminPage back={{ href: '/painel', label: 'Voltar para a Visão geral' }}>
      <AboutEditor
        facts={facts}
        history={state.history}
        initial={{
          content: state.content,
          draftUpdatedAt: state.draftUpdatedAt,
          draftSavedLabel: state.draftUpdatedAt ? formatDateTime(state.draftUpdatedAt) : null,
          publishedAt: state.publishedAt,
          publishedSignature: state.publishedSignature,
          contentUnreadable: state.contentUnreadable,
        }}
      />
    </AdminPage>
  );
}
