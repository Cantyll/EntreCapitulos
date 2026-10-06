import 'server-only';

import { CoverError, LIMIT_INPUT_PIXELS, inspectUpload, loadSharp } from '@/lib/books/cover-image';

/*
 * Processa a foto da autora: confere o formato REAL (png, jpeg ou webp, pelo conteúdo e não pelo Content-Type que o
 * navegador declarou) e as dimensões (de 200 a 6000 px), aplica a rotação do EXIF, recorta num quadrado de 512x512 e
 * reencoda para WebP SEM nenhum metadado (o `sharp` não copia EXIF, XMP, IPTC nem perfil de cor para a saída, a
 * menos que se peça). O recorte é AUTOMÁTICO (`attention`: o sharp escolhe a região com mais detalhe e cor); não há
 * detecção de rosto nem tela de recorte. Quem quiser o enquadramento exato envia a foto já quadrada.
 */

export const PHOTO_SIZE = 512;

export async function processAboutPhoto(input: Buffer): Promise<Buffer> {
  const sharp = await loadSharp();
  await inspectUpload(sharp, input);
  try {
    return await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({
        width: PHOTO_SIZE,
        height: PHOTO_SIZE,
        fit: 'cover',
        position: sharp.strategy.attention,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (error) {
    if (error instanceof CoverError) throw error;
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new CoverError('too_large');
    }
    throw new CoverError('unreadable');
  }
}
