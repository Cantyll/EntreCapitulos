import { redirect } from 'next/navigation';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';
import { MODERATION_HREF } from '@/lib/auth/roles';
import { requireRole } from '@/lib/auth/session';

export default async function OverviewPage() {
  const user = await requireRole('staff');
  // A moderadora só tem a fila de comentários: a visão geral é da administradora.
  if (user.role !== 'admin') redirect(MODERATION_HREF);

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
