import type { Metadata, Viewport } from 'next';
import { Instrument_Sans, Newsreader } from 'next/font/google';
import type { ReactNode } from 'react';

import { NavigationProgress } from '@/components/ui/NavigationProgress';
import { BRAND_COLORS, SITE_DESCRIPTION, SITE_NAME } from '@/lib/brand';
import { tokensToStyle } from '@/lib/theme';
import { getSiteTheme } from '@/lib/theme/server';

import '@/styles/tokens.css';
import '@/styles/base.css';

// Newsreader: serifa dos títulos e dos relatos. Variável (peso), romana e itálica, SEM o eixo de
// tamanho óptico (opsz) que o protótipo pede: com ele os dois arquivos somam 273 KB e, sem ele, 120 KB,
// e no 4G lento a serifa chegava 1,6 s depois do resto da página (decisão do dono, impeccable optimize).
const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-newsreader',
});

// Instrument Sans: interface.
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-instrument-sans',
});

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Tela de Início do iOS: "default" (e não "black-translucent") porque o tema é claro.
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'default' },
  // O Next 16 só emite <meta name="mobile-web-app-capable">. O Safari do iOS/iPadOS sempre leu a
  // versão com prefixo, então ela vai junto para o app abrir em tela cheia sem depender do manifest.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

// A cor da barra do navegador acompanha o --rose-deep do tema do livro atual. O manifest continua
// estático e neutro (não dá para ele seguir o tema).
export async function generateViewport(): Promise<Viewport> {
  const theme = await getSiteTheme();
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    // Sem maximumScale nem userScalable: o zoom por pinça precisa continuar livre (acessibilidade).
    themeColor: theme?.['--rose-deep'] ?? BRAND_COLORS.roseDeep,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Tema automático pela capa: as variáveis vão no <html> já no servidor (sem flash). Só passam
  // chaves da allow-list e valores #RRGGBB; sem tema válido, vale o rosa padrão de tokens.css.
  const theme = await getSiteTheme();

  return (
    // data-scroll-behavior: o CSS tem scroll-behavior smooth (âncoras); com isso o Next desliga a
    // rolagem suave só durante a troca de página, para ela não "deslizar" até o topo.
    <html
      lang="pt-BR"
      data-scroll-behavior="smooth"
      className={`${newsreader.variable} ${instrumentSans.variable}`}
      style={theme ? tokensToStyle(theme) : undefined}
    >
      <body>
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
