import type { MetadataRoute } from 'next';

import { BRAND_COLORS, SITE_DESCRIPTION, SITE_NAME } from '@/lib/brand';

/**
 * Manifest do app instalável. É estático e não segue o tema automático da capa: as cores ficam
 * neutras (o --bg padrão). Só o <meta name="theme-color"> acompanha o tema do livro atual.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BRAND_COLORS.bg,
    theme_color: BRAND_COLORS.bg,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
