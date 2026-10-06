import type { ReactNode } from 'react';

import type { RichBlock, RichDoc } from '@/lib/about';
import { isSafeHref } from '@/lib/session-body';
import type { InlineNode, TextNode } from '@/lib/session-body';

/*
 * Renderiza o texto rico da página Sobre (o subconjunto de `src/lib/about/rich-text.ts`) como elementos React. Nada de
 * `dangerouslySetInnerHTML` nem HTML montado por string: o React escapa todo texto (um `<script>` digitado aparece como
 * texto), e o `href` ainda passa por `isSafeHref` aqui (o conteúdo vem do banco, mas a página não confia nele). Link com
 * `rel="noopener noreferrer"`; o que não está na lista de permissões não é desenhado.
 */

function renderText(node: TextNode, key: number): ReactNode {
  let out: ReactNode = node.text;
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'link' && isSafeHref(mark.attrs.href)) {
      const external = !mark.attrs.href.toLowerCase().startsWith('mailto:');
      out = (
        <a
          href={mark.attrs.href}
          rel="noopener noreferrer"
          target={external ? '_blank' : undefined}
        >
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

function renderBlock(block: RichBlock, key: number): ReactNode {
  if (block.type === 'paragraph') return <p key={key}>{renderInline(block.content)}</p>;
  return (
    <ul key={key}>
      {block.content.map((item, i) => (
        <li key={i}>
          {item.content.map((child, j) =>
            child.type === 'paragraph' ? <p key={j}>{renderInline(child.content)}</p> : null,
          )}
        </li>
      ))}
    </ul>
  );
}

export function RichText({ doc, className }: { doc: RichDoc; className?: string }) {
  return <div className={className}>{(doc.content ?? []).map(renderBlock)}</div>;
}
