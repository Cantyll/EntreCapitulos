import { SOBRE } from '@/content/sobre';

import type { AboutContent } from './schema';
import type { RichDoc } from './rich-text';

/**
 * O conteúdo PADRÃO da página Sobre: o texto de `src/content/sobre.ts`, na forma estruturada. É o que `/sobre` mostra
 * enquanto nada foi publicado (ou se a leitura falhar) e o ponto de partida do editor. Cada chamada devolve um objeto
 * novo (o editor pode mexer nele à vontade).
 */
export function defaultAbout(): AboutContent {
  const paragraph = (text: string) => ({
    type: 'paragraph' as const,
    content: [{ type: 'text' as const, text }],
  });
  const intro: RichDoc = {
    type: 'doc',
    content: [paragraph(SOBRE.lead), ...SOBRE.paragraphs.map(paragraph)],
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
