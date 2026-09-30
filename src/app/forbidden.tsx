import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';

import styles from './forbidden.module.css';

/** Página 403 (responde com status 403 via `forbidden()`; exige experimental.authInterrupts). */
export default function Forbidden() {
  return (
    <main className={styles.page}>
      <Container>
        <div className={styles.box}>
          <Logo />
          <h1>Você não tem acesso a esta página</h1>
          <p>
            Esta área é restrita à equipe do clube. Se você acha que deveria ter acesso, fale com a
            administradora.
          </p>
          <div className={styles.actions}>
            <ButtonLink href="/">Voltar para o início</ButtonLink>
          </div>
        </div>
      </Container>
    </main>
  );
}
