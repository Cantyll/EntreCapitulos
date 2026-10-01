import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { DynamicServerError } from 'next/dist/client/components/hooks-server-context';
import { notFound, redirect } from 'next/navigation';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CurrentUserError } from '@/lib/auth/failure';
import { SupabaseEnvError } from '@/lib/supabase/env';

/*
 * O cabeçalho está em todas as páginas públicas. Se o Supabase falhar, a pessoa vê o site como
 * visitante; os erros internos do Next e os bugs de verdade continuam subindo.
 */

const getCurrentUser = vi.fn();

vi.mock('server-only', () => ({}));
// Fora de uma página real não há rota atual: o SiteNav só precisa de um caminho.
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => '/',
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUser() }));

const { SiteHeader } = await import('@/components/site/SiteHeader');

const render = async () =>
  renderToStaticMarkup(await SiteHeader({ currentBookSlug: 'o-livro-de-azrael' }));

/** Capturar o que `redirect()`/`notFound()` lançam, como o Next faz. */
function thrownBy(fn: () => never): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('era para lançar');
}

describe('SiteHeader', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('mostra o nome da pessoa logada', async () => {
    getCurrentUser.mockResolvedValue({
      id: 'u1',
      displayName: 'Marina',
      avatarUrl: null,
      role: 'member',
    });
    const html = await render();
    expect(html).toContain('Menu da conta de Marina');
    expect(html).not.toContain('Participar');
  });

  describe('falhas que viram visitante', () => {
    it.each([
      [
        'variável de ambiente ausente',
        () => new SupabaseEnvError([{ variable: 'NEXT_PUBLIC_SUPABASE_URL', reason: 'missing' }]),
      ],
      ['Auth fora do ar', () => new AuthRetryableFetchError('fetch failed', 0)],
      ['perfil ilegível', () => new CurrentUserError('PGRST301')],
    ])('%s', async (_label, makeError) => {
      getCurrentUser.mockRejectedValue(makeError());

      const html = await render();

      expect(html).toContain('Entrar');
      expect(html).toContain('Participar');
      expect(html).not.toContain('Menu da conta');
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(errorLog.mock.calls[0]?.[0]).toBe('SiteHeader: getCurrentUser falhou');
    });
  });

  describe('erros internos do Next voltam para o Next', () => {
    it('redirect()', async () => {
      const error = thrownBy(() => redirect('/entrar'));
      getCurrentUser.mockRejectedValue(error);
      await expect(render()).rejects.toBe(error);
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('notFound()', async () => {
      const error = thrownBy(() => notFound());
      getCurrentUser.mockRejectedValue(error);
      await expect(render()).rejects.toBe(error);
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('bailout de renderização dinâmica (cookies() no prerender)', async () => {
      const error = new DynamicServerError('Dynamic server usage: cookies');
      getCurrentUser.mockRejectedValue(error);
      await expect(render()).rejects.toBe(error);
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('erro interno embrulhado em outro erro', async () => {
      const inner = thrownBy(() => redirect('/entrar'));
      getCurrentUser.mockRejectedValue(new Error('falhou ao carregar', { cause: inner }));
      // O Next relança o erro interno (a causa), que é o que ele sabe tratar.
      await expect(render()).rejects.toBe(inner);
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('falha de Auth que embrulha um erro interno do Next: o erro do Next prevalece', async () => {
      // Sem o unstable_rethrow, isto seria engolido como "Auth fora do ar".
      const inner = new DynamicServerError('Dynamic server usage: cookies');
      getCurrentUser.mockRejectedValue(
        Object.assign(new AuthRetryableFetchError('fetch failed', 0), { cause: inner }),
      );
      await expect(render()).rejects.toBe(inner);
      expect(errorLog).not.toHaveBeenCalled();
    });
  });

  it('um bug qualquer não é engolido', async () => {
    const bug = new TypeError('Cannot read properties of undefined');
    getCurrentUser.mockRejectedValue(bug);
    await expect(render()).rejects.toBe(bug);
  });
});
