import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TERMS_VERSION } from '@/content/legal/version';

/*
 * /boas-vindas: o nome público e o aceite dos Termos (com a declaração de ter 18 anos ou mais), no mesmo passo.
 * Depois de gravar, o cabeçalho (que vive no layout público, guardado pelo Next) e o aviso dos Termos têm de
 * refletir o novo estado logo após o redirect. Estes testes cobrem: a invalidação do cache do layout ANTES do
 * redirect, a action não deixar o perfil nem o aceite antigos memoizados, a caixa conferida no SERVIDOR antes de
 * chamar o banco e a versão vir do código, nunca do formulário. O fluxo completo, no navegador, está no E2E.
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
const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
  calls.push(`rpc:${name}`);
  void args;
  return { error: rpcError };
});
let updateError: { code: string } | null = null;
let rpcError: { code?: string; message?: string } | null = null;

const revalidatePath = vi.fn((...args: unknown[]) => {
  calls.push(`revalidatePath:${args.join(',')}`);
});
const getCurrentUser = vi.fn();
const requireUser = vi.fn();
const requireUserId = vi.fn(async () => 'user-1');
const isNameConfirmed = vi.fn(async () => false);
const readTermsStatus = vi.fn(async () => 'missing' as string);
const memoizedStatus = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    calls.push(`redirect:${path}`);
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from, rpc }) }));
vi.mock('@/lib/auth/session', () => ({
  requireUserId: () => requireUserId(),
  requireUser: () => requireUser(),
  getCurrentUser: () => getCurrentUser(),
  isNameConfirmed: () => isNameConfirmed(),
}));
vi.mock('@/lib/terms/server', () => ({
  readTermsStatus: () => readTermsStatus(),
  getTermsStatus: () => memoizedStatus(),
}));

const { completeWelcome } = await import('@/app/(public)/boas-vindas/actions');

const initial = { error: null, value: '' };
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe('completeWelcome', () => {
  beforeEach(() => {
    calls.length = 0;
    updateError = null;
    rpcError = null;
    vi.clearAllMocks();
    isNameConfirmed.mockResolvedValue(false);
    readTermsStatus.mockResolvedValue('missing');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('primeiro acesso: grava o nome, registra o aceite, invalida o layout e só então redireciona', async () => {
    await expect(
      completeWelcome(
        initial,
        form({ displayName: 'Marina Teste', next: '/sessoes', acceptTerms: 'on' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/sessoes');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'Marina Teste' }));
    expect(update.mock.calls[0]?.[0]).toHaveProperty('display_name_confirmed_at');
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    // A ordem importa: o nome primeiro, o aceite depois e o `redirect` (que interrompe a função) por último.
    expect(calls).toEqual([
      'from:profiles',
      'update',
      'eq:id=user-1',
      'rpc:accept_terms',
      'revalidatePath:/,layout',
      'redirect:/sessoes',
    ]);
  });

  it('a versão do aceite vem do código (TERMS_VERSION), nunca do formulário', async () => {
    await expect(
      completeWelcome(
        initial,
        form({ displayName: 'Marina', acceptTerms: 'on', version: 'hackeada', p_version: 'x' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('accept_terms', { p_version: TERMS_VERSION });
  });

  it('o servidor exige a caixa marcada ANTES de chamar o banco (nome ou aceite)', async () => {
    const attempts: Record<string, string>[] = [
      { displayName: 'Marina' },
      { displayName: 'Marina', acceptTerms: '' },
      { displayName: 'Marina', acceptTerms: 'false' },
      { displayName: 'Marina', acceptTerms: 'true' },
    ];
    for (const fields of attempts) {
      calls.length = 0;
      const state = await completeWelcome(initial, form(fields));
      expect(state.error).toContain('marque a caixa');
      expect(state.value).toBe('Marina');
      expect(from).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    }
  });

  it('o aceite não pede a idade como "verificada": a mensagem fala em declaração', async () => {
    const state = await completeWelcome(initial, form({ displayName: 'Marina' }));
    expect(state.error).toContain('declaração');
    expect(state.error).not.toMatch(/verificad|confirmad/i);
  });

  it('nome já confirmado e aceite faltando: só registra o aceite (não toca no perfil)', async () => {
    isNameConfirmed.mockResolvedValue(true);

    await expect(
      completeWelcome(initial, form({ next: '/livros/o-livro-de-azrael', acceptTerms: 'on' })),
    ).rejects.toThrow('NEXT_REDIRECT:/livros/o-livro-de-azrael');

    expect(from).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('accept_terms', { p_version: TERMS_VERSION });
    expect(calls).toEqual([
      'rpc:accept_terms',
      'revalidatePath:/,layout',
      'redirect:/livros/o-livro-de-azrael',
    ]);
  });

  it('versão antiga: pede de novo (a caixa é exigida)', async () => {
    isNameConfirmed.mockResolvedValue(true);
    readTermsStatus.mockResolvedValue('outdated');

    const refused = await completeWelcome(initial, form({}));
    expect(refused.error).toContain('marque a caixa');
    expect(rpc).not.toHaveBeenCalled();

    await expect(completeWelcome(initial, form({ acceptTerms: 'on' }))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('já aceitou: a caixa não é pedida nem o banco de aceite é chamado (só o nome)', async () => {
    readTermsStatus.mockResolvedValue('accepted');

    await expect(
      completeWelcome(initial, form({ displayName: 'Marina', next: '/sessoes' })),
    ).rejects.toThrow('NEXT_REDIRECT:/sessoes');

    expect(update).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('leitura do aceite indisponível (unknown): não pede a caixa e não grava aceite', async () => {
    readTermsStatus.mockResolvedValue('unknown');

    await expect(completeWelcome(initial, form({ displayName: 'Marina' }))).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('não lê o perfil nem o aceite memoizados, nem usa o getCurrentUser antes de gravar', async () => {
    await expect(
      completeWelcome(initial, form({ displayName: 'Marina', acceptTerms: 'on' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(requireUserId).toHaveBeenCalledTimes(1);
    expect(requireUser).not.toHaveBeenCalled();
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(memoizedStatus).not.toHaveBeenCalled();
    expect(readTermsStatus).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
  });

  it('o destino do redirect continua validado (next externo cai em "/")', async () => {
    await expect(
      completeWelcome(
        initial,
        form({ displayName: 'Marina', next: 'https://mal.example/x', acceptTerms: 'on' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/');
  });

  it('se o banco recusar o nome, não registra o aceite, não invalida nem redireciona', async () => {
    updateError = { code: '42501' };

    const state = await completeWelcome(
      initial,
      form({ displayName: 'Marina', acceptTerms: 'on' }),
    );

    expect(state.error).toContain('Não foi possível salvar');
    expect(state.value).toBe('Marina');
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(calls.some((c) => c.startsWith('redirect'))).toBe(false);
  });

  it('função de aceite ainda inexistente (migration não aplicada): o nome fica salvo, o layout é atualizado, não redireciona', async () => {
    rpcError = { code: 'PGRST202', message: 'Could not find the function' };

    const state = await completeWelcome(
      initial,
      form({ displayName: 'Marina', acceptTerms: 'on' }),
    );

    expect(state.error).toContain('ainda não está disponível');
    expect(update).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(calls.some((c) => c.startsWith('redirect'))).toBe(false);
  });

  it('outra falha ao registrar o aceite: mensagem genérica, sem redirecionar', async () => {
    rpcError = { code: 'XX000', message: 'boom' };

    const state = await completeWelcome(
      initial,
      form({ displayName: 'Marina', acceptTerms: 'on' }),
    );

    expect(state.error).toContain('Não foi possível registrar o aceite');
    expect(calls.some((c) => c.startsWith('redirect'))).toBe(false);
  });

  it.each(['', '   ', 'pessoa@exemplo.com'])('nome inválido %j não toca no banco', async (name) => {
    const state = await completeWelcome(initial, form({ displayName: name, acceptTerms: 'on' }));

    expect(state.error).not.toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
