import { renderAppIcon } from '@/lib/app-icon';

// Ícones do manifest (Android, Chrome, Edge e "Adicionar ao Dock" no Mac).
const ICONS = {
  'icon-192.png': { size: 192, markScale: 0.5 },
  'icon-512.png': { size: 512, markScale: 0.5 },
  // Maskable: o sistema recorta o ícone (círculo, squircle...). O marcador precisa caber na zona
  // segura, um círculo com 80% do lado; 44% de altura deixa folga de sobra.
  'icon-maskable-512.png': { size: 512, markScale: 0.44 },
} as const;

type IconFile = keyof typeof ICONS;

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return (Object.keys(ICONS) as IconFile[]).map((file) => ({ file }));
}

// O endereço não tem hash, então nada de cache imutável: o ícone é provisório e vai mudar.
const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

export async function GET(_request: Request, { params }: RouteContext<'/icons/[file]'>) {
  const { file } = await params;
  const icon = ICONS[file as IconFile];
  if (!icon) return new Response('Not found', { status: 404 });
  return renderAppIcon(icon, { 'Cache-Control': CACHE_CONTROL });
}
