import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * `setReadingProgress` com o Supabase trocado por um dublê. O ponto principal: a pessoa logada grava
 * por UPDATE e, se não há linha, por INSERT, e NUNCA por upsert (o `ON CONFLICT DO UPDATE` do PostgREST
 * tenta mudar `user_id` e `book_id`, e o banco só deixa a pessoa mudar a coluna `chapter`).
 */

const calls: string[] = [];
const state = {
  viewer: null as { id: string } | null,
  book: { id: 'book-1', slug: 'o-livro-de-azrael', totalChapters: 52 } as {
    id: string;
    slug: string;
    totalChapters: number;
  } | null,
  cookies: {} as Record<string, number>,
  updateRows: [{ chapter: 7 }] as unknown[],
  updateError: null as { code: string } | null,
  insertError: null as { code: string } | null,
};

const cookieSet = vi.fn((...args: unknown[]) => void calls.push(`cookie:${JSON.stringify(args)}`));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }));
const revalidatePath = vi.fn((...a: unknown[]) => void calls.push(`revalidate:${a.join(',')}`));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('@/lib/public/loaders', () => ({ getBookBySlug: async () => state.book }));
vi.mock('@/lib/public/person', () => ({
  getViewer: async () => state.viewer,
  getCookieProgress: async () => state.cookies,
}));

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      update: (values: unknown) => {
        calls.push(`${table}.update:${JSON.stringify(values)}`);
        const chain = {
          eq: () => chain,
          select: async () => ({ data: state.updateRows, error: state.updateError }),
        };
        return chain;
      },
      insert: async (values: unknown) => {
        calls.push(`${table}.insert:${JSON.stringify(values)}`);
        return { error: state.insertError };
      },
      upsert: async () => {
        calls.push(`${table}.upsert`);
        return { error: null };
      },
    }),
  }),
}));

const { setReadingProgress } = await import('@/app/(public)/progress-actions');

beforeEach(() => {
  revalidatePath.mockClear();
  calls.length = 0;
  state.viewer = null;
  state.book = { id: 'book-1', slug: 'o-livro-de-azrael', totalChapters: 52 };
  state.cookies = {};
  state.updateRows = [{ chapter: 7 }];
  state.updateError = null;
  state.insertError = null;
  consoleError.mockClear();
  cookieSet.mockClear();
});

describe('setReadingProgress: validação', () => {
  it.each([-1, 53, 1.5, NaN, Infinity])('recusa o capítulo %s', async (chapter) => {
    const out = await setReadingProgress('o-livro-de-azrael', chapter);
    expect(out.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it.each(['../x', 'Livro Maiúsculo', '', 'a'.repeat(81), "x'; drop table"])(
    'recusa o slug %j sem consultar nada',
    async (slug) => {
      expect((await setReadingProgress(slug, 3)).ok).toBe(false);
      expect(calls).toEqual([]);
    },
  );

  it('livro que não existe', async () => {
    state.book = null;
    const out = await setReadingProgress('nao-existe', 3);
    expect(out).toEqual({ ok: false, message: 'Livro não encontrado.' });
  });

  it('aceita 0 e o total do livro', async () => {
    expect((await setReadingProgress('o-livro-de-azrael', 0)).ok).toBe(true);
    expect((await setReadingProgress('o-livro-de-azrael', 52)).ok).toBe(true);
  });

  it('o total do livro é o teto (livro de 5 capítulos não aceita 6)', async () => {
    state.book = { id: 'b', slug: 'curto', totalChapters: 5 };
    expect((await setReadingProgress('curto', 6)).ok).toBe(false);
    expect((await setReadingProgress('curto', 5)).ok).toBe(true);
  });
});

describe('setReadingProgress: visitante', () => {
  it('grava no cookie (httpOnly, Lax, path /, 1 ano) e refaz o layout', async () => {
    const out = await setReadingProgress('o-livro-de-azrael', 10);
    expect(out).toEqual({ ok: true });
    expect(cookieSet).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieSet.mock.calls[0]!;
    expect(name).toBe('ec_progress');
    expect(JSON.parse(value as string)).toEqual({ 'o-livro-de-azrael': 10 });
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 31_536_000,
    });
    expect(calls.some((c) => c.startsWith('revalidate:/,layout'))).toBe(true);
    expect(calls.some((c) => c.includes('reading_progress'))).toBe(false);
  });

  it('mantém o progresso dos outros livros no mesmo cookie', async () => {
    state.cookies = { 'sal-e-cinza': 4 };
    await setReadingProgress('o-livro-de-azrael', 10);
    expect(JSON.parse(cookieSet.mock.calls[0]![1] as string)).toEqual({
      'sal-e-cinza': 4,
      'o-livro-de-azrael': 10,
    });
  });
});

describe('setReadingProgress: pessoa logada', () => {
  beforeEach(() => {
    state.viewer = { id: 'user-1' };
  });

  it('atualiza a linha que já existe (só a coluna chapter) e não usa cookie', async () => {
    const out = await setReadingProgress('o-livro-de-azrael', 7);
    expect(out).toEqual({ ok: true });
    expect(calls).toContain('reading_progress.update:{"chapter":7}');
    expect(calls.some((c) => c.includes('insert') || c.includes('upsert'))).toBe(false);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('sem linha, cria uma (user_id, book_id, chapter)', async () => {
    state.updateRows = [];
    await setReadingProgress('o-livro-de-azrael', 7);
    expect(calls).toContain(
      'reading_progress.insert:{"user_id":"user-1","book_id":"book-1","chapter":7}',
    );
  });

  it('nunca usa upsert', async () => {
    state.updateRows = [];
    await setReadingProgress('o-livro-de-azrael', 7);
    await setReadingProgress('o-livro-de-azrael', 8);
    expect(calls.some((c) => c.includes('upsert'))).toBe(false);
  });

  it('duas abas criando juntas (23505): a perdedora atualiza', async () => {
    state.updateRows = [];
    state.insertError = { code: '23505' };
    let first = true;
    state.updateRows = [];
    const out = await setReadingProgress('o-livro-de-azrael', 7);
    void first;
    first = false;
    expect(out).toEqual({ ok: true });
    expect(calls.filter((c) => c.startsWith('reading_progress.update')).length).toBe(2);
  });

  it('erro do banco: mensagem genérica em pt-BR e log sem o texto do erro', async () => {
    state.updateError = { code: 'XX000', message: 'segredo@exemplo.com' } as never;
    const out = await setReadingProgress('o-livro-de-azrael', 7);
    expect(out).toEqual({
      ok: false,
      message: 'Não foi possível guardar agora. Tente de novo em instantes.',
    });
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain('segredo@exemplo.com');
    expect(logged).toContain('XX000');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refaz o layout depois de gravar', async () => {
    await setReadingProgress('o-livro-de-azrael', 7);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
});
