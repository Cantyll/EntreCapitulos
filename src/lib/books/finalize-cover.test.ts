import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { finalizeCoverWith, COVER_MESSAGES } = await import('./finalize-cover');

const ID = '10000000-0000-4000-8000-000000000001';
const PREVIOUS = `books/${ID}/previous.webp`;
const ORIGINAL = `books/${ID}/upload.png`;
const OTHER_BOOK_FILE = 'books/10000000-0000-4000-8000-000000000002/keep.webp';

/** Dublê em memória do Storage e da tabela books (só o que o finalizeCover usa). */
function fakeSupabase(
  initial: { files?: Record<string, Buffer>; book?: { cover_path: string | null } | null } = {},
) {
  const files = new Map<string, Buffer>(Object.entries(initial.files ?? {}));
  const book = initial.book === undefined ? { cover_path: PREVIOUS } : initial.book;
  const state = {
    updateError: null as unknown,
    updated: null as Record<string, unknown> | null,
    uploadError: null as unknown,
  };
  const removeCalls: string[][] = [];

  const bucket = {
    download: vi.fn(async (path: string) => {
      const file = files.get(path);
      return file
        ? { data: new Blob([new Uint8Array(file)]), error: null }
        : { data: null, error: new Error('not found') };
    }),
    upload: vi.fn(async (path: string, body: Buffer) => {
      if (state.uploadError) return { data: null, error: state.uploadError };
      files.set(path, body);
      return { data: { path }, error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      removeCalls.push(paths);
      for (const p of paths) files.delete(p);
      return { data: [], error: null };
    }),
    list: vi.fn(async (folder: string) => ({
      data: [...files.keys()]
        .filter((p) => p.startsWith(`${folder}/`))
        .map((p) => ({ name: p.slice(folder.length + 1), id: 'x' })),
      error: null,
    })),
  };

  const supabase = {
    storage: { from: vi.fn(() => bucket) },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: book && { id: ID, ...book }, error: null }),
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          if (state.updateError) return { error: state.updateError };
          state.updated = values;
          if (book) book.cover_path = values.cover_path as string;
          return { error: null };
        },
      }),
    })),
  };
  return {
    supabase: supabase as never,
    storageFrom: supabase.storage.from,
    files,
    state,
    bucket,
    removeCalls,
    book,
  };
}

const png = (w: number, h: number, background: string) =>
  sharp({ create: { width: w, height: h, channels: 3, background } })
    .png()
    .toBuffer();

/** Capa com duas faixas coloridas, para ter paleta de verdade. */
async function colorful() {
  const top = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#B02050' },
  })
    .png()
    .toBuffer();
  const bottom = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#203A90' },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width: 400, height: 600, channels: 3, background: '#FFFFFF' } })
    .composite([
      { input: top, top: 0, left: 0 },
      { input: bottom, top: 300, left: 0 },
    ])
    .png()
    .toBuffer();
}

describe('finalizeCoverWith', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('capa colorida: grava WebP novo, paleta e tokens; depois limpa tudo o que sobrou', async () => {
    const f = fakeSupabase({
      files: {
        [ORIGINAL]: await colorful(),
        [PREVIOUS]: Buffer.from('antiga'),
        [`books/${ID}/abandonado.jpg`]: Buffer.from('x'),
        [OTHER_BOOK_FILE]: Buffer.from('outro livro'),
      },
    });

    const result = await finalizeCoverWith(f.supabase, ID, ORIGINAL);

    expect(result).toEqual({ ok: true, theme: 'applied' });
    const newPath = f.state.updated!.cover_path as string;
    expect(newPath).toMatch(new RegExp(`^books/${ID}/[0-9a-f-]{36}\\.webp$`));
    expect(f.state.updated!.theme_tokens).toMatchObject({
      '--rose-2': expect.stringMatching(/^#[0-9A-F]{6}$/),
    });
    expect(f.state.updated!.palette).toMatchObject({
      accent: expect.stringMatching(/^#[0-9A-F]{6}$/),
      colors: expect.any(Array),
    });
    // Só a capa nova sobra na pasta do livro; o outro livro não é tocado.
    expect([...f.files.keys()].sort()).toEqual([newPath, OTHER_BOOK_FILE].sort());
    const meta = await sharp(f.files.get(newPath)!).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });

  it('capa em tons de cinza: salva a capa, zera paleta e tema', async () => {
    const f = fakeSupabase({ files: { [ORIGINAL]: await png(400, 600, '#808080') } });
    const result = await finalizeCoverWith(f.supabase, ID, ORIGINAL);
    expect(result).toEqual({ ok: true, theme: 'none' });
    expect(f.state.updated).toMatchObject({ palette: null, theme_tokens: null });
  });

  it('reduz para no máximo 1000x1500 e aplica a rotação do EXIF', async () => {
    const big = await sharp({
      create: { width: 2400, height: 1600, channels: 3, background: '#B02050' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const f = fakeSupabase({ files: { [ORIGINAL]: big } });
    await finalizeCoverWith(f.supabase, ID, ORIGINAL);
    const meta = await sharp(f.files.get(f.state.updated!.cover_path as string)!).metadata();
    // Orientação 6 troca largura e altura: 1600x2400, que cabe em 1000x1500.
    expect([meta.width, meta.height]).toEqual([1000, 1500]);
  });

  it('se o update do livro falha: apaga só a capa nova e o original; a anterior continua', async () => {
    const f = fakeSupabase({
      files: {
        [ORIGINAL]: await colorful(),
        [PREVIOUS]: Buffer.from('antiga'),
        [`books/${ID}/abandonado.jpg`]: Buffer.from('x'),
      },
    });
    f.state.updateError = Object.assign(new Error('banco caiu'), {
      name: 'PostgrestError',
      code: '57014',
    });

    const result = await finalizeCoverWith(f.supabase, ID, ORIGINAL);

    expect(result).toEqual({ ok: false, error: COVER_MESSAGES.save_failed });
    expect([...f.files.keys()].sort()).toEqual([`books/${ID}/abandonado.jpg`, PREVIOUS].sort());
    expect(f.book!.cover_path).toBe(PREVIOUS);
    // Nada de varredura antes de o update dar certo: só 1 remoção, com a nova e o original.
    expect(f.removeCalls).toHaveLength(1);
    expect(f.removeCalls[0]).toHaveLength(2);
    expect(f.removeCalls[0]).toContain(ORIGINAL);
    expect(f.removeCalls[0]).not.toContain(PREVIOUS);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('banco caiu');
  });

  it('se o upload da capa nova falha: apaga o original e mantém a anterior', async () => {
    const f = fakeSupabase({
      files: { [ORIGINAL]: await colorful(), [PREVIOUS]: Buffer.from('antiga') },
    });
    f.state.uploadError = new Error('storage fora');
    const result = await finalizeCoverWith(f.supabase, ID, ORIGINAL);
    expect(result.ok).toBe(false);
    expect([...f.files.keys()]).toEqual([PREVIOUS]);
  });

  it.each([
    [
      'arquivo que não é imagem',
      () => Promise.resolve(Buffer.from('<?php echo 1; ?>')),
      'invalid_format',
    ],
    [
      'SVG disfarçado de PNG',
      () =>
        Promise.resolve(
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"/>'),
        ),
      'invalid_format',
    ],
    [
      'GIF',
      () =>
        sharp({ create: { width: 400, height: 600, channels: 3, background: '#B02050' } })
          .gif()
          .toBuffer(),
      'invalid_format',
    ],
    ['imagem pequena', () => png(150, 600, '#B02050'), 'too_small'],
    ['imagem larga demais', () => png(6001, 300, '#B02050'), 'too_large'],
  ])('%s: mensagem em pt-BR, original apagado, livro intacto', async (_label, make, key) => {
    const f = fakeSupabase({
      files: { [ORIGINAL]: await make(), [PREVIOUS]: Buffer.from('antiga') },
    });
    const result = await finalizeCoverWith(f.supabase, ID, ORIGINAL);
    expect(result).toEqual({
      ok: false,
      error: COVER_MESSAGES[key as keyof typeof COVER_MESSAGES],
    });
    expect(f.state.updated).toBeNull();
    expect(f.bucket.upload).not.toHaveBeenCalled();
    expect([...f.files.keys()]).toEqual([PREVIOUS]);
  });

  it('caminho inválido: não toca em nada do Storage', async () => {
    const f = fakeSupabase({ files: { [PREVIOUS]: Buffer.from('antiga') } });
    for (const bad of [
      `books/${ID}/../x.png`,
      'books/10000000-0000-4000-8000-000000000002/x.png',
      `covers/${ID}/x.png`,
    ]) {
      expect(await finalizeCoverWith(f.supabase, ID, bad)).toEqual({
        ok: false,
        error: COVER_MESSAGES.invalid_upload,
      });
    }
    expect(await finalizeCoverWith(f.supabase, 'nao-e-uuid', ORIGINAL)).toEqual({
      ok: false,
      error: COVER_MESSAGES.invalid_upload,
    });
    expect(f.storageFrom).not.toHaveBeenCalled();
    expect(f.removeCalls).toHaveLength(0);
  });

  it('livro inexistente: apaga o original enviado', async () => {
    const f = fakeSupabase({ files: { [ORIGINAL]: await colorful() }, book: null });
    expect(await finalizeCoverWith(f.supabase, ID, ORIGINAL)).toEqual({
      ok: false,
      error: COVER_MESSAGES.book_not_found,
    });
    expect(f.files.size).toBe(0);
  });

  it('arquivo grande demais: recusa sem decodificar', async () => {
    const f = fakeSupabase({ files: { [ORIGINAL]: Buffer.alloc(5 * 1024 * 1024 + 1) } });
    expect(await finalizeCoverWith(f.supabase, ID, ORIGINAL)).toEqual({
      ok: false,
      error: COVER_MESSAGES.file_too_big,
    });
  });

  it('o log de uma falha inesperada não leva message nem caminhos', async () => {
    const f = fakeSupabase({ files: { [ORIGINAL]: await colorful() } });
    f.state.uploadError = Object.assign(new Error(`falhou em ${ORIGINAL}`), {
      name: 'StorageApiError',
      status: 500,
    });
    await finalizeCoverWith(f.supabase, ID, ORIGINAL);
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain('StorageApiError');
    expect(logged).not.toContain(ORIGINAL);
    expect(logged).not.toContain('books/');
  });
});
