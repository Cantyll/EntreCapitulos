import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logFailure = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/log', () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));

const { finalizeAboutPhotoWith, PHOTO_MESSAGES } = await import('./finalize-photo');

/*
 * `finalizeAboutPhoto` com um Storage de mentira e o `sharp` de verdade: o caminho precisa ser o de envio; o formato
 * REAL é conferido; a foto sai em `site/sobre/<uuid>.webp` 512x512 sem metadados; o original (com EXIF) é apagado
 * (na falha, na hora); a foto anterior NUNCA é apagada aqui.
 */

const UUID = '0b9f5f00-1111-4222-8333-444455556666';
const UPLOAD = `site/sobre/incoming/${UUID}.jpg`;
const PREVIOUS = 'site/sobre/11111111-2222-4333-8444-555555555555.webp';

type Storage = {
  objects: Map<string, Buffer>;
  calls: string[];
  uploads: { path: string; options: Record<string, unknown> }[];
  failUpload: boolean;
  failDownload: boolean;
};

let storage: Storage;

const client = () =>
  ({
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe('covers');
        return {
          download: async (path: string) => {
            storage.calls.push(`download:${path}`);
            const data = storage.objects.get(path);
            if (storage.failDownload || !data)
              return { data: null, error: { name: 'StorageApiError', message: 'x' } };
            return { data: new Blob([new Uint8Array(data)]), error: null };
          },
          upload: async (path: string, body: Buffer, options: Record<string, unknown>) => {
            storage.calls.push(`upload:${path}`);
            if (storage.failUpload)
              return { data: null, error: { name: 'StorageApiError', message: 'x' } };
            storage.objects.set(path, body);
            storage.uploads.push({ path, options });
            return { data: { path }, error: null };
          },
          remove: async (paths: string[]) => {
            for (const path of paths) {
              storage.calls.push(`remove:${path}`);
              storage.objects.delete(path);
            }
            return { data: [], error: null };
          },
        };
      },
    },
  }) as never;

async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: '#cf6c88' } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'SEGREDO-DO-ORIGINAL' } } as never)
    .toBuffer();
}

beforeEach(() => {
  storage = {
    objects: new Map([[PREVIOUS, Buffer.from('foto anterior')]]),
    calls: [],
    uploads: [],
    failUpload: false,
    failDownload: false,
  };
  logFailure.mockClear();
});

describe('finalizeAboutPhotoWith', () => {
  it('sucesso: grava a foto 512x512 em WebP sem metadados com nome novo e só então apaga o original', async () => {
    storage.objects.set(UPLOAD, await jpegWithExif());
    const result = await finalizeAboutPhotoWith(client(), UPLOAD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toMatch(/^site\/sobre\/[0-9a-f-]{36}\.webp$/);
    expect(result.path).not.toContain(UUID);

    const saved = storage.objects.get(result.path)!;
    const meta = await sharp(saved).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 512, 512]);
    expect(meta.exif).toBeUndefined();
    expect(saved.toString('latin1')).not.toContain('SEGREDO-DO-ORIGINAL');
    expect(storage.uploads[0]!.options).toMatchObject({ contentType: 'image/webp', upsert: false });

    // O original só sai DEPOIS de a foto nova existir.
    expect(storage.calls).toEqual([
      `download:${UPLOAD}`,
      `upload:${result.path}`,
      `remove:${UPLOAD}`,
    ]);
    expect(storage.objects.has(UPLOAD)).toBe(false);
  });

  it('a foto ANTERIOR nunca é apagada aqui (o publicado e o histórico ainda podem usá-la)', async () => {
    storage.objects.set(UPLOAD, await jpegWithExif());
    await finalizeAboutPhotoWith(client(), UPLOAD);
    expect(storage.calls.filter((call) => call.startsWith('remove:'))).toEqual([
      `remove:${UPLOAD}`,
    ]);
    expect(storage.objects.has(PREVIOUS)).toBe(true);
  });

  it('um arquivo que não é imagem (mesmo enviado como .jpg) é recusado e o original é apagado na hora', async () => {
    storage.objects.set(UPLOAD, Buffer.from('não sou uma imagem, só um texto'));
    const result = await finalizeAboutPhotoWith(client(), UPLOAD);
    expect(result).toEqual({ ok: false, error: PHOTO_MESSAGES.invalid_format });
    expect(storage.objects.has(UPLOAD)).toBe(false);
    expect(storage.uploads).toEqual([]);
    expect(storage.objects.has(PREVIOUS)).toBe(true);
  });

  it('imagem pequena demais: recusada, original apagado, nada gravado', async () => {
    storage.objects.set(
      UPLOAD,
      await sharp({ create: { width: 120, height: 120, channels: 3, background: '#fff' } })
        .jpeg()
        .toBuffer(),
    );
    const result = await finalizeAboutPhotoWith(client(), UPLOAD);
    expect(result).toEqual({ ok: false, error: PHOTO_MESSAGES.too_small });
    expect(storage.uploads).toEqual([]);
    expect(storage.objects.has(UPLOAD)).toBe(false);
  });

  it('acima de 5 MB: recusada e o original apagado (sem processar)', async () => {
    storage.objects.set(UPLOAD, Buffer.alloc(5 * 1024 * 1024 + 1));
    const result = await finalizeAboutPhotoWith(client(), UPLOAD);
    expect(result).toEqual({ ok: false, error: PHOTO_MESSAGES.file_too_big });
    expect(storage.uploads).toEqual([]);
    expect(storage.objects.has(UPLOAD)).toBe(false);
  });

  it('falha ao gravar a foto nova: o original é apagado (nenhuma sobra com EXIF) e só o erro é registrado', async () => {
    storage.objects.set(UPLOAD, await jpegWithExif());
    storage.failUpload = true;
    const result = await finalizeAboutPhotoWith(client(), UPLOAD);
    expect(result).toEqual({ ok: false, error: PHOTO_MESSAGES.save_failed });
    expect(storage.objects.has(UPLOAD)).toBe(false);
    expect([...storage.objects.keys()]).toEqual([PREVIOUS]);
    expect(logFailure).toHaveBeenCalledWith('about.photo.finalize', expect.anything());
    expect(JSON.stringify(logFailure.mock.calls)).not.toContain('SEGREDO');
  });

  it('não achou o arquivo enviado: erro genérico, nada além do original é tocado', async () => {
    storage.failDownload = true;
    const result = await finalizeAboutPhotoWith(client(), UPLOAD);
    expect(result).toEqual({ ok: false, error: PHOTO_MESSAGES.save_failed });
    expect(storage.calls.filter((call) => call.startsWith('remove:'))).toEqual([
      `remove:${UPLOAD}`,
    ]);
  });

  it.each([
    ['site/sobre/incoming/nome-solto.jpg'],
    [`site/sobre/${UUID}.webp`],
    [`site/sobre/incoming/${UUID}.gif`],
    [`books/${UUID}/${UUID}.png`],
    [`site/sobre/incoming/../${UUID}.jpg`],
    [`covers/site/sobre/incoming/${UUID}.jpg`],
    [''],
    [null],
    [42],
    [{ path: UPLOAD }],
  ])('caminho que não é o de envio (%j): recusado SEM tocar no Storage', async (path) => {
    const result = await finalizeAboutPhotoWith(client(), path);
    expect(result).toEqual({ ok: false, error: PHOTO_MESSAGES.invalid_upload });
    expect(storage.calls).toEqual([]);
  });
});
