import { connection } from 'next/server';

import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';

import styles from './forbidden.module.css';

/**
 * 404 geral (endereço que não existe em lugar nenhum do site), em português.
 *
 * `connection()` obriga a renderizar por requisição: sem isso o Next guarda esta página pronta (estática) e
 * ela sairia SEM o nonce da CSP, com os scripts bloqueados.
 */
export default async function NotFound() {
  await connection();
  return (
    <main className={styles.page}>
      <Container>
        <div className={styles.box}>
          <Logo />
          <h1>Não encontramos esta página</h1>
          <p>O endereço pode ter mudado ou nunca ter existido. Que tal começar pelo início?</p>
          <div className={styles.actions}>
            <ButtonLink href="/">Voltar para o início</ButtonLink>
          </div>
        </div>
      </Container>
    </main>
  );
}
