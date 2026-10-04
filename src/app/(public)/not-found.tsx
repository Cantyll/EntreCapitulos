import { NoInstallCard } from '@/components/install/NoInstallCard';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';

import styles from '@/app/forbidden.module.css';

/** 404 das páginas públicas (livro ou sessão que não existe): dentro do cabeçalho e do rodapé do site. */
export default function PublicNotFound() {
  return (
    <Container>
      <NoInstallCard />
      <div className={styles.box} style={{ padding: '64px 0' }}>
        <h1>Não encontramos esta página</h1>
        <p>O livro ou a sessão que você procura não existe ou mudou de endereço.</p>
        <div className={styles.actions} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <ButtonLink href="/">Voltar para o início</ButtonLink>
          <ButtonLink href="/estante" variant="ghost">
            Ver a estante
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
