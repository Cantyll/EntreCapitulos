import type { ReactNode } from 'react';

import styles from './render.module.css';
import { isSafeHref } from './schema';
import type {
  BlockNode,
  BodyDoc,
  ChapterDividerNode,
  InlineNode,
  ListItemNode,
  ParagraphNode,
  TextNode,
} from './types';

/*
 * Renderiza o corpo da sessão como elementos React. Nada de `dangerouslySetInnerHTML` nem HTML
 * montado por string: o React escapa todo texto, e o `href` ainda passa por `isSafeHref` aqui (o
 * corpo vem do banco, mas a página não confia nele). Cada divisor de capítulo abre uma
 * `<section id="ch-N" data-chapter="N">` (a etapa 5 aplica o filtro de spoiler sobre elas); o que
 * vem antes do primeiro divisor é a abertura e fica fora das seções, sempre visível.
 */

function renderText(node: TextNode, key: number): ReactNode {
  let out: ReactNode = node.text;
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'link' && isSafeHref(mark.attrs.href)) {
      out = (
        <a href={mark.attrs.href} rel="noopener noreferrer" target="_blank">
          {out}
        </a>
      );
    }
  }
  return <span key={key}>{out}</span>;
}

function renderInline(content: InlineNode[] | undefined): ReactNode {
  return content?.map((node, i) =>
    node.type === 'hardBreak' ? <br key={i} /> : renderText(node, i),
  );
}

function renderParagraph(node: ParagraphNode, key: number): ReactNode {
  return <p key={key}>{renderInline(node.content)}</p>;
}

function renderListItem(item: ListItemNode, key: number): ReactNode {
  return (
    <li key={key}>
      {item.content.map((child, i) =>
        child.type === 'paragraph' ? renderParagraph(child, i) : renderBlock(child, i),
      )}
    </li>
  );
}

function renderBlock(node: BlockNode, key: number): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return renderParagraph(node, key);
    case 'heading':
      // O <h2> da página já é o "Capítulo N": o título do corpo desce um nível.
      return <h3 key={key}>{renderInline(node.content)}</h3>;
    case 'blockquote':
      return <blockquote key={key}>{node.content.map(renderParagraph)}</blockquote>;
    case 'theory':
      return (
        <aside key={key} className={styles.theory} aria-label="Minha teoria">
          <strong>Minha teoria</strong>
          {node.content.map(renderParagraph)}
        </aside>
      );
    case 'bulletList':
      return <ul key={key}>{node.content.map(renderListItem)}</ul>;
    case 'orderedList':
      return (
        <ol key={key} start={node.attrs?.start}>
          {node.content.map(renderListItem)}
        </ol>
      );
    case 'chapterDivider':
      return null;
  }
}

function ChapterHeading({ divider }: { divider: ChapterDividerNode }) {
  const { chapter, title } = divider.attrs;
  return (
    <h2 className={styles.chapter}>
      <small>Capítulo {chapter}</small>
      {title ? title : null}
    </h2>
  );
}

/** Agrupa os blocos: abertura (antes do primeiro divisor) e uma seção por divisor. */
export function groupBody(doc: BodyDoc): {
  opening: BlockNode[];
  sections: { divider: ChapterDividerNode; blocks: BlockNode[] }[];
} {
  const opening: BlockNode[] = [];
  const sections: { divider: ChapterDividerNode; blocks: BlockNode[] }[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === 'chapterDivider') sections.push({ divider: node, blocks: [] });
    else (sections.at(-1)?.blocks ?? opening).push(node);
  }
  return { opening, sections };
}

export function SessionBody({ doc, className }: { doc: BodyDoc; className?: string }) {
  const { opening, sections } = groupBody(doc);
  return (
    <div className={[styles.prose, className].filter(Boolean).join(' ')}>
      {opening.length > 0 ? (
        <div className={styles.opening} data-opening="">
          {opening.map(renderBlock)}
        </div>
      ) : null}
      {sections.map(({ divider, blocks }, index) => (
        <section
          key={index}
          id={`ch-${divider.attrs.chapter}`}
          data-chapter={divider.attrs.chapter}
          className={styles.section}
        >
          <ChapterHeading divider={divider} />
          {blocks.map(renderBlock)}
        </section>
      ))}
    </div>
  );
}
