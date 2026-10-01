import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Depois de gravar o nome em /boas-vindas, o cabeçalho (que vive no layout público, guardado pelo
 * Next) tem de mostrar o nome novo logo após o redirect. Estes testes cobrem as duas metades:
 * a invalidação do cache do layout ANTES do redirect, e a action não deixar o perfil antigo
 * memoizado. O fluxo completo, no navegador, foi conferido à parte (ver o PR).
 */

const calls: string[] = [];
const eq = vi.fn(async (column: string, value: string) => {
  calls.push(`eq:${column}=${value}`);
  return { error: updateError };
});
const update = vi.fn((values: Record<string, unknown>) => {
  calls.push('update');
  void values;
  return { eq };
});
const select = vi.fn();
const from = vi.fn((table: string) => {
  calls.push(`from:${table}`);
  return { update, select };
});
let updateError: { code: string } | null = null;

const revalidatePath = vi.fn((...args: unknown[]) => {
  calls.push(`revalidatePath:${args.join(',')}`);
});
const getCurrentUser = vi.fn();
const requireUser = vi.fn();
const requireUserId = vi.fn(async () => 'user-1');

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    calls.push(`redirect:${path}`);
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }));
vi.mock('@/lib/auth/session', () => ({
  requireUserId: () => requireUserId(),
  requireUser: () => requireUser(),
  getCurrentUser: () => getCurrentUser(),
}));

const { saveDisplayName } = await import('@/app/(public)/boas-vindas/actions');

const initial = { error: null, value: '' };
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe('saveDisplayName', () => {
  beforeEach(() => {
    calls.length = 0;
    updateError = null;
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('grava o nome, invalida o layout e só então redireciona', async () => {
    await expect(
      saveDisplayName(initial, form({ displayName: 'Marina Teste', next: '/sessoes' })),
    ).rejects.toThrow('NEXT_REDIRECT:/sessoes');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'Marina Teste' }));
    expect(update.mock.calls[0]?.[0]).toHaveProperty('display_name_confirmed_at');
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    // A ordem importa: `redirect` interrompe a função, então a invalidação tem de vir antes.
    expect(calls).toEqual([
      'from:profiles',
      'update',
      'eq:id=user-1',
      'revalidatePath:/,layout',
      'redirect:/sessoes',
    ]);
  });

  it('não lê o perfil nem usa o getCurrentUser antes de gravar (nada memoizado com o nome antigo)', async () => {
    await expect(saveDisplayName(initial, form({ displayName: 'Marina' }))).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(requireUserId).toHaveBeenCalledTimes(1);
    expect(requireUser).not.toHaveBeenCalled();
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('o destino do redirect continua validado (next externo cai em "/")', async () => {
    await expect(
      saveDisplayName(initial, form({ displayName: 'Marina', next: 'https://mal.example/x' })),
    ).rejects.toThrow('NEXT_REDIRECT:/');
  });

  it('se o banco recusar, não invalida nem redireciona', async () => {
    updateError = { code: '42501' };

    const state = await saveDisplayName(initial, form({ displayName: 'Marina' }));

    expect(state.error).toContain('Não foi possível salvar');
    expect(state.value).toBe('Marina');
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(calls.some((c) => c.startsWith('redirect'))).toBe(false);
  });

  it.each(['', '   ', 'pessoa@exemplo.com'])('nome inválido %j não toca no banco', async (name) => {
    const state = await saveDisplayName(initial, form({ displayName: name }));

    expect(state.error).not.toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
