import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Nova sessão' };

export default async function NewSessionPage() {
  await requireRole('admin');

  return (
    <AdminPage back={{ href: '/painel/sessoes', label: 'Voltar para Sessões' }}>
      <StubNotice flush>
        No protótipo, o editor do relato tem a divisória de capítulo, os trechos e anotações, as
        perguntas para a discussão e as opções de publicação (pública ou só para membros, e
        agendamento).
      </StubNotice>
    </AdminPage>
  );
}
