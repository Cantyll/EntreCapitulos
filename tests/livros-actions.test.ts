import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Server Actions de livros com o Supabase trocado por um dublê: validação em pt-BR, mapeamento
 * dos erros do banco, invalidação do cache do tema e log sem texto da mensagem do erro.
 */

const calls: string[] = [];
const state = {
  slugs: [] as string[],
  insertError: null as unknown,
  rpcError: null as unknown,
  sessions: 0,
  deleteError: null as unknown,
};

const updateTag = vi.fn((tag: string) => void calls.push(`updateTag:${tag}`));
const revalidatePath = vi.fn((...a: unknown[]) => void calls.push(`revalidatePath:${a.join(',')}`));
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const requireRole = vi.fn(async (role: string) => {
  void role;
  return { id: 'admin-1' };
});

const insertedRows: Record<string, unknown>[] = [];
const rpc = vi.fn(async (name: string) => {
  calls.push(`rpc:${name}`);
  return { data: null, error: state.rpcError };
});

function table(name: string) {
  return {
    select: (_cols?: string, opts?: { head?: boolean }) => {
      void opts;
      const result =
        name === 'reading_sessions'
          ? { count: state.sessions, error: null }
          : { data: state.slugs.map((slug) => ({ slug })), error: null };
      const chain = Object.assign(Promise.resolve(result), {
        like: async () => result,
        eq: () =>
          Object.assign(Promise.resolve(result), {
            maybeSingle: async () => ({ data: { current_chapter: 3 }, error: null }),
          }),
        maybeSingle: async () => ({ data: { current_chapter: 3 }, error: null }),
      });
      return chain;
    },
    insert: (row: Record<string, unknown>) => {
      calls.push('insert');
      insertedRows.push(row);
      return {
        select: () => ({
          single: async () =>
            state.insertError
              ? { data: null, error: state.insertError }
              : { data: { id: '10000000-0000-4000-8000-000000000001' }, error: null },
        }),
      };
    },
    update: () => ({ eq: async () => ({ error: null }) }),
    delete: () => ({
      eq: async () => {
        calls.push('delete');
        return { error: state.deleteError };
      },
    }),
  };
}

const storageBucket = {
  list: vi.fn(async () => ({ data: [], error: null })),
  remove: vi.fn(async () => ({ error: null })),
};

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  updateTag: (t: string) => updateTag(t),
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));
vi.mock('next/navigation', () => ({ redirect: (p: string) => redirect(p) }));
vi.mock('@/lib/auth/session', () => ({ requireRole: (r: string) => requireRole(r) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (n: string) => table(n),
    rpc,
    storage: { from: () => storageBucket },
  }),
}));

const actions = await import('@/app/painel/livros/actions');
const idle = { status: 'idle', message: '' } as const;
const ID = '10000000-0000-4000-8000-000000000001';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const valid = {
  title: 'O Livro de Azrael',
  author: 'Amber V. Nicole',
  synopsis: '',
  genres: 'Fantasia,Romance',
  total_chapters: '52',
  status: 'queued',
};

describe('ações de livros', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    calls.length = 0;
    insertedRows.length = 0;
    Object.assign(state, {
      slugs: [],
      insertError: null,
      rpcError: null,
      sessions: 0,
      deleteError: null,
    });
    vi.clearAllMocks();
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('toda ação confere o papel admin primeiro', async () => {
    await actions.createBook(idle, form({}));
    await actions.updateBook(idle, form({}));
    await actions.updateProgress(idle, form({}));
    await actions.startBook(idle, form({}));
    await actions.finishBook(idle, form({}));
    await actions.setThemeAuto(idle, form({}));
    await actions.deleteBook(idle, form({}));
    expect(requireRole).toHaveBeenCalledTimes(7);
    expect(requireRole).toHaveBeenCalledWith('admin');
  });

  it('formulário inválido: erros por campo em pt-BR e nada é gravado', async () => {
    const result = await actions.createBook(
      idle,
      form({ ...valid, title: '', total_chapters: '' }),
    );
    expect(result.status).toBe('error');
    expect(result.errors).toMatchObject({
      title: 'Preencha o título.',
      total_chapters: 'Informe o total de capítulos.',
    });
    expect(calls).toEqual([]);
  });

  it('cria na fila com slug único, capítulo 0 e invalida o tema e o layout', async () => {
    state.slugs = ['o-livro-de-azrael'];
    const result = await actions.createBook(idle, form(valid));
    expect(result).toMatchObject({ status: 'ok', bookId: ID });
    expect(insertedRows[0]).toMatchObject({
      slug: 'o-livro-de-azrael-2',
      status: 'queued',
      current_chapter: 0,
      genres: ['Fantasia', 'Romance'],
      total_chapters: 52,
    });
    expect(calls).toContain('updateTag:theme');
    expect(calls).toContain('revalidatePath:/,layout');
  });

  it('livro já terminado entra com nota, data e capítulo = total', async () => {
    await actions.createBook(
      idle,
      form({ ...valid, status: 'finished', rating: '4,5', finished_at: '2026-03-10' }),
    );
    expect(insertedRows[0]).toMatchObject({
      status: 'finished',
      rating: 4.5,
      finished_at: '2026-03-10',
      current_chapter: 52,
    });
    const bad = await actions.createBook(
      idle,
      form({ ...valid, status: 'finished', rating: '4.3', finished_at: '2026-03-10' }),
    );
    expect(bad.errors?.rating).toBeDefined();
  });

  it('"lendo agora" sem a migration: o livro fica na fila e o aviso diz o que falta', async () => {
    state.rpcError = { code: 'PGRST202', message: 'Could not find the function public.start_book' };
    const result = await actions.createBook(idle, form({ ...valid, status: 'reading' }));
    expect(result.status).toBe('ok');
    expect(result.message).toContain('Livro criado na fila.');
    expect(result.message).toContain('Database deploy');
  });

  it('começar a ler com outro livro em leitura: mensagem em pt-BR, sem invalidar nada', async () => {
    state.rpcError = {
      code: 'P0001',
      message: 'book_already_reading: finish the book being read before starting another',
    };
    const result = await actions.startBook(idle, form({ bookId: ID }));
    expect(result).toMatchObject({
      status: 'error',
      message: expect.stringContaining('Já existe um livro em leitura'),
    });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it('terminar exige a nota antes de chamar o banco', async () => {
    const result = await actions.finishBook(idle, form({ bookId: ID, rating: '' }));
    expect(result.errors?.rating).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
    const ok = await actions.finishBook(idle, form({ bookId: ID, rating: '4,5' }));
    expect(ok.status).toBe('ok');
    expect(rpc).toHaveBeenCalledWith('finish_book', { p_book_id: ID, p_rating: 4.5 });
  });

  it('id inválido nunca chega ao banco', async () => {
    for (const run of [
      actions.startBook,
      actions.finishBook,
      actions.deleteBook,
      actions.setThemeAuto,
      actions.updateProgress,
      actions.updateBook,
    ]) {
      expect((await run(idle, form({ bookId: '../etc', rating: '4' }))).status).toBe('error');
    }
    expect(calls).toEqual([]);
  });

  it('o total não pode ficar abaixo do capítulo atual', async () => {
    const result = await actions.updateProgress(
      idle,
      form({ bookId: ID, current_chapter: '10', total_chapters: '5' }),
    );
    expect(result.errors?.total_chapters).toMatch(/abaixo do capítulo atual/);
    const edit = await actions.updateBook(
      idle,
      form({ ...valid, bookId: ID, total_chapters: '2' }),
    );
    expect(edit.errors?.total_chapters).toMatch(/abaixo do capítulo atual/);
  });

  it('excluir: livro com sessões é recusado, sem sessões apaga e volta para a lista', async () => {
    state.sessions = 2;
    expect((await actions.deleteBook(idle, form({ bookId: ID }))).message).toContain('tem sessões');
    expect(calls).not.toContain('delete');

    state.sessions = 0;
    await expect(actions.deleteBook(idle, form({ bookId: ID }))).rejects.toThrow(
      'NEXT_REDIRECT:/painel/livros',
    );
    expect(calls).toContain('delete');
    expect(storageBucket.list).toHaveBeenCalled();
  });

  it('erro inesperado: mensagem genérica em pt-BR e log só com o resumo', async () => {
    state.insertError = Object.assign(new Error('segredo: senha do banco 123'), {
      name: 'PostgrestError',
      code: 'XX000',
    });
    const result = await actions.createBook(idle, form(valid));
    expect(result.message).toBe('Não foi possível salvar agora. Tente de novo em instantes.');
    expect(errorLog).toHaveBeenCalledWith(
      'books.create falhou',
      expect.objectContaining({ name: 'PostgrestError', code: 'XX000' }),
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('segredo');
  });
});
