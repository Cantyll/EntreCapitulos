import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/log', () => ({ logFailure: vi.fn() }));

const { processAboutPhoto, PHOTO_SIZE } = await import('./photo-image');
const { CoverError } = await import('@/lib/books/cover-image');

/*
 * A foto da autora no `sharp` de verdade: formato real, dimensões, rotação do EXIF, recorte quadrado de 512x512, WebP
 * e REMOÇÃO de todos os metadados (EXIF com localização, XMP, IPTC, perfil de cor).
 */

/** Uma imagem de teste com cores diferentes em cada metade (para ver a rotação) e metadados que NÃO podem sobreviver. */
async function image(
  width: number,
  height: number,
  format: 'png' | 'jpeg' | 'webp',
  withMetadata = false,
): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 80 } },
  }).composite([
    {
      input: {
        create: {
          width: Math.floor(width / 2),
          height,
          channels: 3,
          background: { r: 20, g: 90, b: 200 },
        },
      },
      left: 0,
      top: 0,
    },
  ]);
  const meta = withMetadata
    ? base.withExif({
        IFD0: { Copyright: 'SEGREDO-DA-FOTO', ImageDescription: 'casa da autora' },
        IFD3: {
          GPSLatitudeRef: 'S',
          GPSLatitude: '11 51 0',
          GPSLongitudeRef: 'W',
          GPSLongitude: '55 30 0',
        },
      } as never)
    : base;
  if (format === 'png') return meta.png().toBuffer();
  if (format === 'webp') return meta.webp().toBuffer();
  return meta.jpeg().toBuffer();
}

beforeAll(() => {
  // Sem cache do libvips: cada teste decodifica de verdade.
  sharp.cache(false);
});

describe('processAboutPhoto', () => {
  it.each(['png', 'jpeg', 'webp'] as const)('%s vira WebP quadrado de 512x512', async (format) => {
    const out = await processAboutPhoto(await image(800, 600, format));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(PHOTO_SIZE);
    expect(meta.height).toBe(PHOTO_SIZE);
    expect(PHOTO_SIZE).toBe(512);
  });

  it('retrato, paisagem e quadrado: todos saem 512x512', async () => {
    for (const [w, h] of [
      [300, 900],
      [900, 300],
      [512, 512],
      [200, 200],
    ] as const) {
      const meta = await sharp(await processAboutPhoto(await image(w, h, 'jpeg'))).metadata();
      expect([meta.width, meta.height]).toEqual([512, 512]);
    }
  });

  it('REMOVE todos os metadados: EXIF (inclusive a localização), XMP, IPTC e perfil de cor', async () => {
    const input = await image(640, 480, 'jpeg', true);
    // Sanidade: a entrada TEM os metadados que a saída não pode ter.
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();
    expect(before.exif?.toString('latin1')).toContain('SEGREDO-DA-FOTO');

    const out = await processAboutPhoto(input);
    const after = await sharp(out).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.tifftagPhotoshop).toBeUndefined();
    // E nenhum vestígio dos textos nos bytes do arquivo.
    const raw = out.toString('latin1');
    expect(raw).not.toContain('SEGREDO-DA-FOTO');
    expect(raw).not.toContain('casa da autora');
    expect(raw).not.toContain('Exif');
    expect(after.orientation).toBeUndefined();
  });

  it('aplica a rotação do EXIF (orientação 6) e não deixa a tag de orientação na saída', async () => {
    // 600x300 com orientação 6 (girar 90°): lido como 300x600. O lado esquerdo azul vira o TOPO da imagem.
    const jpeg = await sharp({
      create: { width: 600, height: 300, channels: 3, background: { r: 200, g: 40, b: 80 } },
    })
      .composite([
        {
          input: {
            create: { width: 300, height: 300, channels: 3, background: { r: 20, g: 90, b: 200 } },
          },
          left: 0,
          top: 0,
        },
      ])
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).orientation).toBe(6);

    const out = await processAboutPhoto(jpeg);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([512, 512]);
    const pixel = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i]!, data[i + 1]!, data[i + 2]!];
    };
    // Depois da rotação o azul ficou em cima e o vermelho embaixo.
    const top = pixel(256, 30);
    const bottom = pixel(256, 480);
    expect(top[2]!).toBeGreaterThan(top[0]!);
    expect(bottom[0]!).toBeGreaterThan(bottom[2]!);
    expect((await sharp(out).metadata()).orientation).toBeUndefined();
  });

  it('um arquivo que NÃO é imagem, mesmo com nome e tipo de PNG, é recusado pelo formato real', async () => {
    await expect(
      processAboutPhoto(Buffer.from('isto é só um texto com cara de imagem')),
    ).rejects.toMatchObject({
      name: 'CoverError',
      code: 'invalid_format',
    });
    await expect(
      processAboutPhoto(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"/>'),
      ),
    ).rejects.toBeInstanceOf(CoverError);
  });

  it('GIF e outros formatos reais que o servidor não aceita são recusados', async () => {
    const gif = await sharp({
      create: { width: 300, height: 300, channels: 3, background: '#fff' },
    })
      .gif()
      .toBuffer();
    await expect(processAboutPhoto(gif)).rejects.toMatchObject({ code: 'invalid_format' });
  });

  it('dimensões: menos de 200 px ou mais de 6000 px é recusado', async () => {
    await expect(processAboutPhoto(await image(199, 400, 'png'))).rejects.toMatchObject({
      code: 'too_small',
    });
    await expect(processAboutPhoto(await image(400, 199, 'png'))).rejects.toMatchObject({
      code: 'too_small',
    });
    await expect(processAboutPhoto(await image(200, 200, 'png'))).resolves.toBeInstanceOf(Buffer);
    await expect(processAboutPhoto(await image(6001, 200, 'png'))).rejects.toMatchObject({
      code: 'too_large',
    });
  });

  it('arquivo corrompido (cabeçalho de PNG com lixo): recusado, nunca derruba', async () => {
    const real = await image(300, 300, 'png');
    const broken = Buffer.concat([real.subarray(0, 60), Buffer.from('lixo lixo lixo lixo')]);
    await expect(processAboutPhoto(broken)).rejects.toBeInstanceOf(CoverError);
  });
});
