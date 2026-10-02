import type { MetadataRoute } from 'next';

import { PRIVATE_PATHS } from '@/lib/robots-paths';

/**
 * robots.txt: o site público pode ser indexado; as áreas privadas e de login, não. Isto só pede que os
 * buscadores não rastreiem: quem não deve ser indexado também tem `noindex` na própria página (o `robots.txt`
 * sozinho não impede a indexação de um endereço que alguém linke). Sem sitemap por enquanto (Fase 3).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...PRIVATE_PATHS] }],
  };
}
