import { redirect } from 'next/navigation';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';
import { hasRole, panelHomeFor } from '@/lib/auth/roles';
import { requireRole } from '@/lib/auth/session';

export default async function OverviewPage() {
  const user = await requireRole('staff');
  // A moderadora só usa Comentários.
  if (!hasRole(user.role, 'admin')) redirect(panelHomeFor(user.role));

  return (
    <AdminPage>
      <StubNotice flush>
        No protótipo, a visão geral tem a saudação, quatro indicadores, a leitura atual com a
        próxima sessão sugerida, os comentários por sessão, a fila de aprovação e a atividade
        recente.
      </StubNotice>
    </AdminPage>
  );
}
