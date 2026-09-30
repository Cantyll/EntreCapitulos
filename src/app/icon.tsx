import { renderAppIcon } from '@/lib/app-icon';

// Ícone das abas e dos favoritos. Pequeno: o marcador ocupa mais do quadro para continuar legível
// a 16px.
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return renderAppIcon({ size: size.width, markScale: 0.72 });
}
