// Nome e descrição moram em `site.ts`; aqui ficam só as cores que vivem fora do CSS.
export { SITE_DESCRIPTION, SITE_NAME } from './site';

/**
 * Valores do tema padrão (src/styles/tokens.css). Manifest, ícones e theme-color vivem fora do
 * CSS e não seguem o tema automático da capa, então repetem estes valores de propósito.
 */
export const BRAND_COLORS = {
  bg: '#FFF8F9',
  rose: '#CF6C88',
  roseDeep: '#7E3350',
} as const;
