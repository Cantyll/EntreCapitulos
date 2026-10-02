import type { Metadata } from 'next';

import { PageHeader } from '@/components/site/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';

export const metadata: Metadata = { title: 'Conta excluída', robots: { index: false } };

export default function AccountDeletedPage() {
  return (
    <Container>
      <PageHeader
        title="Sua conta foi excluída"
        lead="Seus dados e comentários foram apagados e você saiu da conta. Agradecemos por ter feito parte do clube."
      />
      <p style={{ marginBottom: 48 }}>
        <ButtonLink href="/" variant="soft">
          Ir para o início
        </ButtonLink>
      </p>
    </Container>
  );
}
