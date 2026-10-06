import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultAbout } from './defaults';

/*
 * A leitura PÚBLICA da página Sobre. O site nunca quebra por causa dela: sem nada publicado, com a migration ainda não
 * aplicada, com a leitura falhando ou com um conteúdo inválido, `/sobre` mostra o texto de `src/content/sobre.ts`. Só a
 * falha que não é "tabela ausente" é registrada, e só pelo código (nunca o conteúdo nem a mensagem do banco).
 */

const state = {
  result: { data: null, error: null } as { data: unknown; error: unknown },
  throws: false,
  selects: [] as string[],
  eqs: [] as string[],
  tag: '' as string,
};
const logFailure = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  // O `unstable_cache` de verdade não guarda exceção; aqui só interessa o que a função lê e a tag.
  unstable_cache: (fn: () => unknown, _key: string[], options: { tags: string[] }) => {
    state.tag = options.tags.join(',');
    return fn;
  },
  updateTag: vi.fn(),
}));
vi.mock('@/lib/auth/log', () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));
vi.mock('@/lib/public/client', () => ({
  createPublicClient: () => ({
    from: (table: string) => {
      state.selects.push(`from:${table}`);
      const chain: Record<string, unknown> = {};
      chain.select = (columns: string) => {
        state.selects.push(`select:${columns}`);
        return chain;
      };
      chain.eq = (column: string, value: string) => {
        state.eqs.push(`${column}=${value}`);
        return chain;
      };
      chain.maybeSingle = async () => {
        if (state.throws) throw new Error('rede caiu com o texto "Meu segredo"');
        return state.result;
      };
      return chain;
    },
  }),
}));

const { getPublishedAbout } = await import('./queries');

const published = () => {
  const content = defaultAbout();
  content.title = 'Título publicado';
  return { content, published_at: '2026-10-06T15:00:00.123456+00:00' };
};

beforeEach(() => {
  state.result = { data: null, error: null };
  state.throws = false;
  state.selects.length = 0;
  state.eqs.length = 0;
  logFailure.mockClear();
});

describe('getPublishedAbout', () => {
  it('lê só as colunas públicas da página "sobre", e o cache usa a tag site:sobre', async () => {
    state.result = { data: published(), error: null };
    await getPublishedAbout();
    expect(state.selects).toEqual(['from:site_pages', 'select:content, published_at']);
    expect(state.eqs).toEqual(['slug=sobre']);
    expect(state.tag).toBe('site:sobre');
  });

  it('com conteúdo publicado válido, devolve o publicado (o texto do banco, nunca o do código)', async () => {
    state.result = { data: published(), error: null };
    const result = await getPublishedAbout();
    expect(result.source).toBe('published');
    expect(result.content.title).toBe('Título publicado');
    expect(result.publishedAt).toBe('2026-10-06T15:00:00.123456+00:00');
    expect(logFailure).not.toHaveBeenCalled();
  });

  it('sem nada publicado: o texto de src/content/sobre.ts, em silêncio', async () => {
    const result = await getPublishedAbout();
    expect(result.source).toBe('default');
    expect(result.content).toEqual(defaultAbout());
    expect(result.publishedAt).toBeNull();
    expect(logFailure).not.toHaveBeenCalled();
  });

  it.each(['PGRST205', 'PGRST202', 'PGRST200', '42P01', '42883'])(
    'migration ainda não aplicada (%s): o texto de código, em silêncio',
    async (code) => {
      state.result = {
        data: null,
        error: { code, message: 'relation "site_pages" does not exist' },
      };
      const result = await getPublishedAbout();
      expect(result.source).toBe('default');
      expect(logFailure).not.toHaveBeenCalled();
    },
  );

  it('outra falha do banco: o texto de código, e só o erro é registrado (nunca a mensagem)', async () => {
    const error = { code: '57014', message: 'texto do conteúdo', details: 'mais texto' };
    state.result = { data: null, error };
    const result = await getPublishedAbout();
    expect(result.source).toBe('default');
    expect(logFailure).toHaveBeenCalledTimes(1);
    expect(logFailure).toHaveBeenCalledWith('sobre.leitura', error);
  });

  it('exceção na leitura (rede): o texto de código e um registro só do erro', async () => {
    state.throws = true;
    const result = await getPublishedAbout();
    expect(result.source).toBe('default');
    expect(logFailure).toHaveBeenCalledTimes(1);
    expect(logFailure.mock.calls[0]![0]).toBe('sobre.leitura');
  });

  it('conteúdo publicado que não passa na validação: o texto de código, registrado só pelo motivo', async () => {
    state.result = {
      data: {
        content: { ...defaultAbout(), links: [{ label: 'x', url: 'javascript:alert(1)' }] },
        published_at: '2026-10-06T15:00:00+00:00',
      },
      error: null,
    };
    const result = await getPublishedAbout();
    expect(result.source).toBe('default');
    expect(logFailure).toHaveBeenCalledTimes(1);
    const [operation, error] = logFailure.mock.calls[0]! as [
      string,
      { name: string; code: string; message: string },
    ];
    expect(operation).toBe('sobre.conteudo');
    expect(error.name).toBe('InvalidPublishedAbout');
    expect(error.code).toBe('invalid');
    expect(JSON.stringify(error)).not.toContain('javascript');
    expect(error.message).not.toContain('javascript');
  });

  it('conteúdo publicado que não é um objeto: o texto de código', async () => {
    state.result = {
      data: { content: 'texto solto', published_at: '2026-10-06T15:00:00+00:00' },
      error: null,
    };
    const result = await getPublishedAbout();
    expect(result.source).toBe('default');
    expect(logFailure).toHaveBeenCalledTimes(1);
  });
});
