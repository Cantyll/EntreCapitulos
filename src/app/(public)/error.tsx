'use client';

import { NoInstallCard } from '@/components/install/NoInstallCard';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';

import styles from '@/app/forbidden.module.css';

/** Falha ao montar uma página pública (banco fora do ar, por exemplo): aviso em português e nova tentativa. */
export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container>
      <NoInstallCard />
      <div className={styles.box} style={{ padding: '64px 0' }}>
        <h1>Algo deu errado por aqui</h1>
        <p>Não conseguimos carregar esta página agora. Tente de novo em instantes.</p>
        <div className={styles.actions}>
          <Button onClick={() => reset()}>Tentar de novo</Button>
        </div>
      </div>
    </Container>
  );
}
