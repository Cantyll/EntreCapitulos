import { SOBRE } from '@/content/sobre';

import type { AboutContent } from './schema';
import type { RichDoc } from './rich-text';

/**
 * O conteúdo PADRÃO da página Sobre: o texto de `src/content/sobre.ts`, na forma estruturada. É o que `/sobre` mostra
 * enquanto nada foi publicado (ou se a leitura falhar) e o ponto de partida do editor. Cada chamada devolve um objeto
 * novo (o editor pode mexer nele à vontade).
 */
export function defaultAbout(): AboutContent {
  const paragraph = (text: string, index: number) => {
    const found = SOBRE.emphasis.find((e) => e.paragraph === index && text.includes(e.text));
    if (!found) return { type: 'paragraph' as const, content: [{ type: 'text' as const, text }] };
    const at = text.indexOf(found.text);
    const before = text.slice(0, at);
    const after = text.slice(at + found.text.length);
    return {
      type: 'paragraph' as const,
      content: [
        ...(before ? [{ type: 'text' as const, text: before }] : []),
        { type: 'text' as const, text: found.text, marks: [{ type: found.mark }] },
        ...(after ? [{ type: 'text' as const, text: after }] : []),
      ],
    };
  };
  const intro: RichDoc = {
    type: 'doc',
    content: [SOBRE.lead, ...SOBRE.paragraphs].map(paragraph),
  };
  return {
    v: 1,
    title: SOBRE.title,
    intro,
    bio: SOBRE.bio,
    photo: null,
    sections: [],
    links: [],
    stats: { visible: true },
    howItWorks: {
      visible: true,
      steps: SOBRE.steps.map((step) => ({ title: step.title, text: step.text })),
    },
    cta: { visible: true, text: SOBRE.cta.text },
  };
}
