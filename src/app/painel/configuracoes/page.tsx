import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { StubNotice } from '@/components/ui/StubNotice';

export const metadata: Metadata = { title: 'Configurações' };

export default function SettingsAdminPage() {
  return (
    <AdminPage>
      <StubNotice flush>
        No protótipo, esta página tem a identidade do site, a cor de destaque, as opções da
        comunidade e os e-mails.
      </StubNotice>
    </AdminPage>
  );
}
