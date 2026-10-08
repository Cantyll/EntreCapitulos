import { Container } from '@/components/ui/Container';

import styles from './Skeleton.module.css';

/*
 * Esqueletos dos `loading.tsx`. Só formas cinzas no lugar certo (sem texto inventado). Um aviso
 * "Carregando" fica só para leitor de tela; o resto é decorativo.
 */

const Bar = ({ w = '100%', h = 14 }: { w?: string; h?: number }) => (
  <span className={styles.bar} style={{ width: w, height: h }} aria-hidden="true" />
);

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div aria-busy="true" className={styles.frame}>
      <p className={styles.sr} role="status">
        Carregando…
      </p>
      {children}
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <Frame>
      <div className={styles.band}>
        <Container>
          <div className={styles.hero}>
            <span className={styles.cover} aria-hidden="true" />
            <div className={styles.stack}>
              <Bar w="110px" />
              <Bar w="70%" h={46} />
              <Bar w="30%" h={20} />
              <Bar h={16} />
              <Bar w="90%" h={90} />
            </div>
          </div>
        </Container>
      </div>
      <Container>
        <div className={styles.list}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.stack}>
              <Bar w="120px" />
              <Bar w="75%" h={24} />
              <Bar />
            </div>
          ))}
        </div>
      </Container>
    </Frame>
  );
}

export function BookSkeleton() {
  return (
    <Frame>
      <Container>
        <div className={styles.hero}>
          <span className={styles.cover} aria-hidden="true" />
          <div className={styles.stack}>
            <Bar w="140px" />
            <Bar w="65%" h={46} />
            <Bar w="25%" h={20} />
            <Bar h={80} />
          </div>
        </div>
        <Bar h={160} />
      </Container>
    </Frame>
  );
}

export function SessionSkeleton() {
  return (
    <Frame>
      <Container>
        <div className={styles.article}>
          <Bar w="30%" h={24} />
          <Bar w="80%" h={46} />
          <Bar w="40%" h={36} />
          <Bar h={56} />
          <Bar h={14} />
          <Bar h={14} />
          <Bar w="85%" h={14} />
          <Bar h={14} />
        </div>
      </Container>
    </Frame>
  );
}

export function ListSkeleton() {
  return (
    <Frame>
      <Container>
        <div className={styles.article}>
          <Bar w="50%" h={44} />
          <Bar w="35%" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.stack}>
              <Bar w="90px" />
              <Bar w="70%" h={24} />
              <Bar />
            </div>
          ))}
        </div>
      </Container>
    </Frame>
  );
}

/** A discussão da sessão enquanto carrega (o relato já está na tela). */
export function DiscussionSkeleton() {
  return (
    <div aria-busy="true" className={styles.article}>
      <p className={styles.sr} role="status">
        Carregando a discussão…
      </p>
      <Bar w="30%" h={32} />
      <Bar h={110} />
      <Bar h={56} />
      <Bar h={56} />
    </div>
  );
}
