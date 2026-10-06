import Image from 'next/image';

import { InstallGuide } from '@/components/install/InstallGuide';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { COMMUNITY_RULES } from '@/content/legal/community-rules';
import { SOBRE } from '@/content/sobre';
import { isSafeLinkUrl, sitePhotoUrl, type AboutContent, type AboutFact } from '@/lib/about';
import { AUTHOR } from '@/lib/site';

import styles from './about.module.css';
import { RichText } from './RichText';

/*
 * A página "Sobre o clube", como componente puro: recebe o conteúdo (já validado) e devolve o HTML. É o MESMO
 * componente da página pública e da pré-visualização do painel (`src/components/sobre/editor`), por isso não lê
 * nada do servidor: tudo chega por `props`. O layout é fixo: o conteúdo é estruturado e o visual segue o tema da
 * capa do livro atual (nada de cor, fonte ou HTML escolhidos por quem edita).
 *
 * Ordem no HTML (marcada com `data-about`): apresentação (título e cartão da autora), texto de abertura, seções extras,
 * "Como funciona", estatísticas, Combinados da comunidade, "Leia como aplicativo" e a chamada final. Os Combinados
 * (`COMMUNITY_RULES`, em código, versionados com os Termos) e "Leia como aplicativo" (etapa 8e) NÃO são editáveis nem
 * ocultáveis: não há campo no conteúdo para eles. Estatísticas, "Como funciona" e a chamada final se ocultam.
 */
export function AboutView({
  content,
  facts,
  showCta,
}: {
  content: AboutContent;
  /** Só os números que não são zero (ver `aboutFacts`). */
  facts: readonly AboutFact[];
  /** A chamada final só aparece para quem não está logado. */
  showCta: boolean;
}) {
  const photoUrl = content.photo ? sitePhotoUrl(content.photo.path) : null;
  // O conteúdo vem do banco, mas a página não confia nele: só desenha link https de verdade.
  const links = content.links.filter((link) => isSafeLinkUrl(link.url));

  return (
    <div className={styles.root} data-about-root="">
      <section className={styles.about} aria-labelledby="sobre-titulo">
        <h1 id="sobre-titulo" className={styles.title} data-about="presentation">
          {content.title}
        </h1>

        <aside className={styles.card} aria-label="A autora" data-about="presentation">
          {photoUrl && content.photo ? (
            <Image
              src={photoUrl}
              alt={content.photo.alt}
              width={120}
              height={120}
              unoptimized
              className={styles.photo}
              data-about-photo=""
            />
          ) : (
            <Avatar name={AUTHOR.name} size="lg" className={styles.avatar} />
          )}
          <h2>{AUTHOR.name}</h2>
          {content.bio !== '' && <p className={styles.bio}>{content.bio}</p>}
          {links.length > 0 && (
            <ul className={styles.links} aria-label="Links da autora">
              {links.map((link, index) => (
                <li key={index}>
                  <a href={link.url} rel="noopener noreferrer" target="_blank">
                    {link.label}
                    <VisuallyHidden> (abre em outra aba)</VisuallyHidden>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className={styles.text} data-about="text">
          <RichText doc={content.intro} className={`${styles.prose} ${styles.intro}`} />
        </div>

        {content.sections.length > 0 && (
          <div className={styles.sections} data-about="sections">
            {content.sections.map((section, index) => (
              <section
                key={index}
                className={styles.extra}
                aria-labelledby={`sobre-secao-${index + 1}`}
                data-about-section={index + 1}
              >
                <h2 id={`sobre-secao-${index + 1}`}>{section.title}</h2>
                <RichText doc={section.body} className={styles.prose} />
              </section>
            ))}
          </div>
        )}
      </section>

      {content.howItWorks.visible && (
        <section className={styles.block} aria-labelledby="como-titulo" data-about="how">
          <h2 id="como-titulo" className={styles.h2}>
            Como funciona
          </h2>
          <ol className={styles.steps}>
            {content.howItWorks.steps.map((step, i) => (
              <li key={i} className={styles.step}>
                <span className={styles.n} aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {content.stats.visible && facts.length > 0 && (
        <section className={styles.block} aria-label="O clube em números" data-about="stats">
          <ul className={styles.facts}>
            {facts.map((fact) => (
              <li key={fact.label}>
                <b>{fact.value}</b>
                {fact.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.block} aria-labelledby="combinados-titulo" data-about="rules">
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
      <div className={styles.block} id="app" data-about="app">
        <InstallGuide variant="about" />
      </div>

      {content.cta.visible && showCta && (
        <div className={styles.cta} data-about="cta">
          <div>
            <h2>{SOBRE.cta.title}</h2>
            <p>{content.cta.text}</p>
          </div>
          <ButtonLink href="/entrar">{SOBRE.cta.button}</ButtonLink>
        </div>
      )}
    </div>
  );
}
