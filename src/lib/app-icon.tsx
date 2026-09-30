import { ImageResponse } from 'next/og';

import { BRAND_COLORS } from '@/lib/brand';

type AppIconOptions = {
  /** Lado do ícone, em px (o ícone é quadrado). */
  size: number;
  /** Altura do marcador de livro em relação ao lado do ícone. */
  markScale: number;
};

/**
 * Ícone do app, provisório: marcador de livro do logo em --rose sobre --bg. Sempre um quadrado
 * cheio, opaco e sem cantos arredondados (o iOS e o Android aplicam a própria máscara).
 *
 * O marcador é o do logo do cabeçalho (src/components/ui/Logo.tsx): no viewBox do logo ele ocupa
 * x 1..15 e y 0..21, por isso o viewBox aqui é recortado nessa caixa.
 */
export function renderAppIcon({ size, markScale }: AppIconOptions, headers?: HeadersInit) {
  const markHeight = size * markScale;
  const markWidth = (markHeight / 21) * 14;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: BRAND_COLORS.bg,
      }}
    >
      <svg width={markWidth} height={markHeight} viewBox="1 0 14 21">
        <path d="M1 0h14v21l-7-5-7 5z" fill={BRAND_COLORS.rose} />
        <path d="M4 0v14" stroke={BRAND_COLORS.roseDeep} strokeWidth="1.2" opacity="0.35" />
      </svg>
    </div>,
    { width: size, height: size, headers },
  );
}
