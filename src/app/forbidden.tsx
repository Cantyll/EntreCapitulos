import type { Metadata } from 'next';

import { ForbiddenNotice } from '@/components/site/ForbiddenNotice';
import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';

import styles from './forbidden.module.css';

export const metadata: Metadata = { title: 'Acesso restrito' };

/** 403 geral: quem está logado mas não tem papel para a página (ex.: membro no painel). */
export default function Forbidden() {
  return (
    <main id="conteudo" className={styles.page}>
      <Container>
        <div className={styles.logo}>
          <Logo />
        </div>
        <ForbiddenNotice
          title="Esta área é só da equipe do clube"
          actions={[{ href: '/', label: 'Voltar para o início' }]}
        >
          <p>
            A sua conta não tem permissão para abrir esta página. Se acha que é um engano, fale com
            a administradora do clube.
          </p>
        </ForbiddenNotice>
      </Container>
    </main>
  );
}
