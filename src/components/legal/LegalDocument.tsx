import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

import { PENDING_LABEL } from '@/content/legal-config';
import type { LegalBlock, LegalDoc } from '@/content/legal/types';

import styles from './legal.module.css';

/** Destaca cada "A DEFINIR" do texto, para ninguém confundir um campo pendente com texto final. */
export function highlightPending(text: string): ReactNode {
  const parts = text.split(PENDING_LABEL);
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <mark className={styles.pending}>{PENDING_LABEL}</mark>}
      {part}
    </Fragment>
  ));
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case 'p':
      return <p>{highlightPending(block.text)}</p>;
    case 'note':
      return <p className={styles.note}>{highlightPending(block.text)}</p>;
    case 'ul':
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{highlightPending(item)}</li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div className={styles.tableWrap}>
          <table>
            <caption className={styles.caption}>{block.caption}</caption>
            <thead>
              <tr>
                {block.head.map((cell) => (
                  <th key={cell} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={i}>{highlightPending(cell)}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

type Props = {
  doc: LegalDoc;
  /** Mostra "Rascunho em revisão" (campo A DEFINIR ou texto ainda não revisado por um profissional). */
  draft: boolean;
  /** Para onde levar quem quer ler o outro texto. */
  other: { href: '/privacidade' | '/termos'; label: string };
};

export function LegalDocument({ doc, draft, other }: Props) {
  return (
    <article className={styles.doc}>
      <h1>{doc.title}</h1>
      <p className={styles.lead}>{doc.lead}</p>

      {draft && (
        <aside className={styles.draft} aria-label="Aviso">
          <strong>Rascunho em revisão.</strong> Este texto ainda não foi revisado por um
          profissional e tem pontos marcados como{' '}
          <mark className={styles.pending}>{PENDING_LABEL}</mark>. Ele não é aconselhamento jurídico
          e pode mudar.
        </aside>
      )}

      <nav className={styles.toc} aria-label="Neste texto">
        <ol>
          {doc.sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.title.replace(/^\d+\.\s*/, '')}</a>
            </li>
          ))}
        </ol>
      </nav>

      {doc.sections.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-titulo`}>
          <h2 id={`${section.id}-titulo`}>{section.title}</h2>
          {section.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </section>
      ))}

      <p className={styles.other}>
        <Link href={other.href}>{other.label}</Link>
      </p>
    </article>
  );
}
