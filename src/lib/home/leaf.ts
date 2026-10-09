/*
 * A virada de página da home ("A página aberta"), como funções PURAS: para onde virar, o gesto de arrastar e os
 * quadros-chave. Quem anima é `SessionLeaf`, com o Motion (Web Animations API, a mesma base que o Safari anima
 * sem esperar uma transição CSS começar).
 *
 * A ordem é a do livro: a página da direita abre na sessão mais recente; as anteriores são páginas de antes.
 * Voltar ("older") traz uma folha da esquerda que se deita sobre a página; avançar ("newer") levanta a folha da
 * página e a deita para a esquerda, mostrando a de baixo.
 */

export type TurnDirection = 'older' | 'newer';

/** Índice 0 é a sessão mais recente; quanto maior, mais antiga. `null` quando não há para onde virar. */
export function turnTarget(index: number, direction: TurnDirection, count: number): number | null {
  const next = direction === 'older' ? index + 1 : index - 1;
  return next >= 0 && next < count ? next : null;
}

/** Arrasto mínimo, em px, para virar a página com o dedo. */
export const SWIPE_MIN_PX = 48;

/**
 * O gesto: arrastar para a DIREITA puxa a página de antes (como a folha da esquerda que vem para cá); para a
 * esquerda, a seguinte. Só vale um arrasto claramente horizontal: rolar a página na vertical nunca vira a folha.
 */
export function swipeIntent(dx: number, dy: number, min = SWIPE_MIN_PX): TurnDirection | null {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx > 0 ? 'older' : 'newer';
}

/** Duração da virada, em ms. Mais curta sem movimento: só um esmaecer. */
export const TURN_MS = 560;
export const TURN_REDUCED_MS = 200;

/** Levantar acelera (a folha sai da página); deitar desacelera (pousa). Nada de mola. */
export const EASE_LIFT = [0.55, 0, 0.75, 0.2] as const;
export const EASE_LAND = [0.16, 1, 0.3, 1] as const;

export type TurnFrames = {
  /** A folha que gira em torno do miolo (a borda esquerda da página). */
  leaf: { transform?: string[]; opacity?: number[] };
  /** A sombra na própria folha, que escurece quando ela fica de pé. */
  shade: { opacity: number[] };
  /** A sombra que a folha joga na página de baixo. Termina sempre apagada (o último quadro fica na tela). */
  cast: { opacity: number[] };
  ease: readonly [number, number, number, number];
  duration: number;
};

/**
 * Eixo da virada: no computador as duas páginas ficam lado a lado e a folha gira em torno do miolo, na vertical
 * (`y`); no celular elas ficam uma sobre a outra e a folha gira em torno da borda de cima, como num caderno (`x`).
 */
export type TurnAxis = 'x' | 'y';

/**
 * Quadros-chave de uma virada. A folha só aparece do lado da página (de 0 a 90 graus, vindo na direção de quem
 * lê): passando de 90 ela ficaria de costas. Com menos movimento, nada gira: a folha só esmaece.
 */
export function turnFrames(
  direction: TurnDirection,
  reduced: boolean,
  axis: TurnAxis = 'y',
): TurnFrames {
  const flat = axis === 'y' ? 'rotateY(0deg)' : 'rotateX(0deg)';
  const upright = axis === 'y' ? 'rotateY(-90deg)' : 'rotateX(90deg)';
  const lifting = direction === 'newer';
  if (reduced) {
    return {
      leaf: { opacity: lifting ? [1, 0] : [0, 1] },
      shade: { opacity: [0, 0] },
      cast: { opacity: [0, 0] },
      ease: EASE_LAND,
      duration: TURN_REDUCED_MS,
    };
  }
  return lifting
    ? {
        leaf: { transform: [flat, upright] },
        shade: { opacity: [0, 0.32] },
        cast: { opacity: [0.28, 0] },
        ease: EASE_LIFT,
        duration: TURN_MS,
      }
    : {
        leaf: { transform: [upright, flat] },
        shade: { opacity: [0.32, 0] },
        // A sombra cresce enquanto a folha desce e some quando ela pousa: o Motion mantém o último quadro.
        cast: { opacity: [0, 0.24, 0] },
        ease: EASE_LAND,
        duration: TURN_MS,
      };
}
