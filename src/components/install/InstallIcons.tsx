/*
 * Ilustrações dos passos de instalação (etapa 8e): SVG inline, desenhado para este site, sem imagem commitada e
 * sem copiar os símbolos da Apple. Só ilustram: o texto de cada passo diz o que tocar (decorativas, aria-hidden).
 */

type GlyphProps = { className?: string };

function Svg({ className, children }: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Caixa aberta no alto com uma seta saindo: "Compartilhar". */
export function ShareGlyph({ className }: GlyphProps) {
  return (
    <Svg className={className}>
      <path d="M8.5 9.5H7.2A2.2 2.2 0 0 0 5 11.7v6.6a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2v-6.6a2.2 2.2 0 0 0-2.2-2.2h-1.3" />
      <path d="M12 14.5v-11" />
      <path d="M8.8 6.7 12 3.5l3.2 3.2" />
    </Svg>
  );
}

/** Quadrado arredondado com um mais: "Adicionar à Tela de Início". */
export function AddGlyph({ className }: GlyphProps) {
  return (
    <Svg className={className}>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </Svg>
  );
}

/** Círculo com um visto: "Adicionar" (confirmar). */
export function ConfirmGlyph({ className }: GlyphProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.2 12.4 2.6 2.6 5-5.4" />
    </Svg>
  );
}
