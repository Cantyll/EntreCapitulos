import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Configurações' };

export default async function SettingsAdminPage() {
  await requireRole('admin');

  return (
    <AdminPage>
      <StubNotice flush>
        No protótipo, esta página tem a identidade do site, a cor de destaque, as opções da
        comunidade e os e-mails.
      </StubNotice>
    </AdminPage>
  );
}
