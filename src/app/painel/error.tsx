'use client';

import { Button } from '@/components/ui/Button';

import styles from '@/app/forbidden.module.css';

/** Falha ao montar uma página do painel: aviso em português, sem detalhe técnico, e nova tentativa. */
export default function PanelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className={styles.box} style={{ padding: '48px 0' }}>
      <h1>Algo deu errado por aqui</h1>
      <p>Não conseguimos carregar esta página agora. Tente de novo em instantes.</p>
      <div className={styles.actions}>
        <Button onClick={() => reset()}>Tentar de novo</Button>
      </div>
    </div>
  );
}
