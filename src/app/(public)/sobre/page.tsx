import type { Metadata } from 'next';

import { InstallGuide } from '@/components/install/InstallGuide';
import { ButtonLink } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Container } from '@/components/ui/Container';
import { Icon } from '@/components/ui/Icon';
import { COMMUNITY_RULES } from '@/content/legal/community-rules';
import { SOBRE } from '@/content/sobre';
import { loadShelf } from '@/lib/public/loaders';
import { getViewer } from '@/lib/public/person';
import { AUTHOR } from '@/lib/site';

import styles from './sobre.module.css';

export const metadata: Metadata = {
  title: 'Sobre o clube',
  description: 'Como funciona o clube de leitura e os combinados da comunidade.',
};

export default async function AboutPage() {
  const [{ finished, queued, counts }, viewer] = await Promise.all([loadShelf(), getViewer()]);

  // Números só do banco, e só os que não são zero.
  const books = finished.length;
  const sessions = [...counts.values()].reduce((sum, n) => sum + n, 0);
  void queued;
  const facts = [
    books > 0
      ? { value: books, label: books === 1 ? 'livro terminado' : 'livros terminados' }
      : null,
    sessions > 0
      ? { value: sessions, label: sessions === 1 ? 'sessão publicada' : 'sessões publicadas' }
      : null,
  ].filter((fact): fact is { value: number; label: string } => fact !== null);

  return (
    <Container>
      <section className={styles.about}>
        <div>
          <h1>{SOBRE.title}</h1>
          <div className={styles.prose}>
            <p className={styles.lead}>{SOBRE.lead}</p>
            {SOBRE.paragraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        </div>
        <aside className={styles.card} aria-label="A autora">
          <Avatar name={AUTHOR.name} size="lg" className={styles.avatar} />
          <h2>{AUTHOR.name}</h2>
          <p className={styles.bio}>{SOBRE.bio}</p>
          {facts.length > 0 && (
            <ul className={styles.facts}>
              {facts.map((fact) => (
                <li key={fact.label}>
                  <b>{fact.value}</b>
                  {fact.label}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </section>

      <section className={styles.block} aria-labelledby="como-titulo">
        <h2 id="como-titulo" className={styles.h2}>
          Como funciona
        </h2>
        <ol className={styles.steps}>
          {SOBRE.steps.map((step, i) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.n} aria-hidden="true">
                {i + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.block} aria-labelledby="combinados-titulo">
        <h2 id="combinados-titulo" className={styles.h2}>
          Combinados da comunidade
        </h2>
        <ul className={styles.rules}>
          {COMMUNITY_RULES.map((rule) => (
            <li key={rule.title}>
              <Icon name={rule.icon} />
              <div>
                <b>{rule.title}</b>
                {rule.text}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Para todos, como informação: os passos de instalação no iPhone e no iPad. */}
      <div className={styles.block} id="app">
        <InstallGuide variant="about" />
      </div>

      {!viewer && (
        <div className={styles.cta}>
          <div>
            <h2>{SOBRE.cta.title}</h2>
            <p>{SOBRE.cta.text}</p>
          </div>
          <ButtonLink href="/entrar">{SOBRE.cta.button}</ButtonLink>
        </div>
      )}
    </Container>
  );
}
