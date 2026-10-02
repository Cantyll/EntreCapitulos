import type { Metadata } from 'next';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { Container } from '@/components/ui/Container';
import { isLegalDraft, legalConfig } from '@/content/legal-config';
import { buildPrivacy } from '@/content/legal/privacy';
import { isGoogleLoginEnabled, isTurnstileEnabled } from '@/lib/auth/features';

/** Rascunho (campo A DEFINIR ou sem revisão profissional): fora dos buscadores. */
export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Como o Entre Capítulos trata os seus dados pessoais.',
  ...(isLegalDraft() ? { robots: { index: false, follow: false } } : {}),
};

export default function PrivacyPage() {
  const doc = buildPrivacy(legalConfig, {
    google: isGoogleLoginEnabled(),
    turnstile: isTurnstileEnabled(),
  });
  return (
    <Container>
      <LegalDocument
        doc={doc}
        draft={isLegalDraft()}
        other={{ href: '/termos', label: 'Ler os Termos de Uso' }}
      />
    </Container>
  );
}
