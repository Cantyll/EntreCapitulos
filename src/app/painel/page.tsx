import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';

export default function OverviewPage() {
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
