import 'server-only';

import { logFailure } from '@/lib/auth/log';
import { extractPalette, deriveTheme, type StoredPalette, type ThemeTokens } from '@/lib/theme';

/*
 * Processa a capa enviada: confere o formato REAL (o bucket só confere o Content-Type que o
 * navegador declarou), as dimensões, e reencoda para WebP sem metadados. Depois extrai a paleta e
 * deriva o tema. O sharp é carregado sob demanda: se ele não carregar (binário nativo ausente no
 * ambiente), o erro vira `CoverError('engine')` e o log leva só o nome do erro.
 */

export const COVER_MIN_SIDE = 200;
export const COVER_MAX_SIDE = 6000;
export const COVER_OUT_MAX = { width: 1000, height: 1500 } as const;
/** 6000 x 6000: protege a memória contra imagens "bomba" antes de decodificar. */
export const LIMIT_INPUT_PIXELS = COVER_MAX_SIDE * COVER_MAX_SIDE;
const PALETTE_WIDTH = 96;

export type CoverErrorCode = 'invalid_format' | 'too_small' | 'too_large' | 'unreadable' | 'engine';

export class CoverError extends Error {
  readonly code: CoverErrorCode;
  constructor(code: CoverErrorCode) {
    super(`cover_${code}`);
    this.name = 'CoverError';
    this.code = code;
  }
}

export async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch (error) {
    // O helper registra só o nome e o código: a mensagem do binário nativo traz caminhos do servidor.
    logFailure('sharp.load', error);
    throw new CoverError('engine');
  }
}

export type ProcessedCover = {
  webp: Buffer;
  width: number;
  height: number;
  palette: StoredPalette | null;
  tokens: ThemeTokens | null;
};

/**
 * Confere o formato REAL (o bucket só confere o Content-Type que o navegador declarou) e as dimensões, SEM decodificar
 * a imagem inteira. Serve à capa e à foto da autora (`src/lib/about/photo-image.ts`). Lança `CoverError`.
 */
export async function inspectUpload(
  sharp: Awaited<ReturnType<typeof loadSharp>>,
  input: Buffer,
): Promise<{ width: number; height: number }> {
  let format: string | undefined;
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(input, {
      limitInputPixels: LIMIT_INPUT_PIXELS,
      failOn: 'error',
    }).metadata();
    format = meta.format;
    // Com rotação por EXIF (orientação 5 a 8) largura e altura se trocam.
    const swapped = (meta.orientation ?? 1) >= 5;
    width = (swapped ? meta.height : meta.width) ?? 0;
    height = (swapped ? meta.width : meta.height) ?? 0;
  } catch (error) {
    if (error instanceof CoverError) throw error;
    // O sharp recusa, antes de decodificar, imagens acima de limitInputPixels.
    if (error instanceof Error && /pixel limit/i.test(error.message))
      throw new CoverError('too_large');
    if (error instanceof Error && /unsupported image format/i.test(error.message)) {
      throw new CoverError('invalid_format');
    }
    throw new CoverError('unreadable');
  }

  if (format !== 'png' && format !== 'jpeg' && format !== 'webp')
    throw new CoverError('invalid_format');
  if (width < COVER_MIN_SIDE || height < COVER_MIN_SIDE) throw new CoverError('too_small');
  if (width > COVER_MAX_SIDE || height > COVER_MAX_SIDE) throw new CoverError('too_large');
  return { width, height };
}

export async function processCover(input: Buffer): Promise<ProcessedCover> {
  const sharp = await loadSharp();
  await inspectUpload(sharp, input);

  try {
    // rotate() aplica a orientação EXIF. O sharp não copia metadados para a saída por padrão.
    const webp = await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ ...COVER_OUT_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const out = await sharp(webp).metadata();
    const { data, info } = await sharp(webp)
      .resize({ width: PALETTE_WIDTH })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colors = extractPalette(data, info.width, info.height);
    const theme = deriveTheme(colors);
    const palette: StoredPalette | null =
      colors && theme
        ? {
            colors: colors.map((c) => ({ hex: c.hex, share: Math.round(c.share * 1000) / 1000 })),
            accent: theme.accent.hex,
          }
        : null;

    return {
      webp,
      width: out.width ?? 0,
      height: out.height ?? 0,
      palette,
      tokens: theme?.tokens ?? null,
    };
  } catch (error) {
    if (error instanceof CoverError) throw error;
    if (error instanceof Error && /pixel limit/i.test(error.message))
      throw new CoverError('too_large');
    throw new CoverError('unreadable');
  }
}
