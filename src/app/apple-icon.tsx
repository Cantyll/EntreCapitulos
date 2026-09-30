import { renderAppIcon } from '@/lib/app-icon';

// Ícone da Tela de Início do iOS/iPadOS: 180x180, opaco e sem cantos arredondados (o iOS aplica a
// máscara). Transparência viraria fundo preto.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return renderAppIcon({ size: size.width, markScale: 0.5 });
}
