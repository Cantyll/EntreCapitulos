import type { Metadata } from 'next';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { Container } from '@/components/ui/Container';
import { isLegalDraft, legalConfig } from '@/content/legal-config';
import { buildTerms } from '@/content/legal/terms';

/** Rascunho (campo A DEFINIR ou sem revisão profissional): fora dos buscadores. */
export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'As regras de convivência e de uso do Entre Capítulos.',
  ...(isLegalDraft() ? { robots: { index: false, follow: false } } : {}),
};

export default function TermsPage() {
  return (
    <Container>
      <LegalDocument
        doc={buildTerms(legalConfig)}
        draft={isLegalDraft()}
        other={{ href: '/privacidade', label: 'Ler a Política de Privacidade' }}
      />
    </Container>
  );
}
