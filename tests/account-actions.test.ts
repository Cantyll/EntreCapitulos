import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * "Minha conta": trocar o nome, excluir a conta e baixar os dados, com o Supabase trocado por um dublê.
 * O que importa: nenhuma ação recebe id de pessoa; a exclusão exige confirmação e recusa a equipe antes
 * de tocar no banco; os cookies do site saem; o arquivo de dados só traz o que é da própria pessoa; e o
 * log nunca leva e-mail, nome nem texto de comentário.
 */

const calls: string[] = [];
const cookieStore = {
  names: ['sb-abc-auth-token', 'sb-abc-auth-token.0', 'ec_progress', 'ec_next', 'outro', 'theme'],
  deleted: [] as string[],
};
const state = {
  user: { id: 'user-1', role: 'member' } as { id: string; role: string },
  rpcResult: { error: null } as { error: unknown },
  signOutThrows: false,
  updateError: null as unknown,
  publicSessions: [{ id: 's1' }, { id: 's2' }] as { id: string }[],
};
const updates: Record<string, unknown>[] = [];
const eqs: string[] = [];

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => void calls.push(`revalidate:${a.join(',')}`),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    calls.push(`redirect:${path}`);
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => cookieStore.names.map((name) => ({ name, value: 'x' })),
    delete: (name: string) => void cookieStore.deleted.push(name),
  }),
}));
const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/session', () => ({
  requireUser: async () => state.user,
  requireUserId: async () => state.user.id,
  getCurrentUser: () => getCurrentUser(),
}));
vi.mock('@/lib/public/queries', () => ({ getPublicSessions: async () => state.publicSessions }));
vi.mock('@/lib/public/tags', () => ({
  invalidateComments: (id?: string) => void calls.push(`invalidate:${id ?? 'counts'}`),
}));
const logFailure = vi.fn();
vi.mock('@/lib/auth/log', () => ({ logFailure: (...a: unknown[]) => logFailure(...a) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async (name: string, args?: unknown) => {
      calls.push(`rpc:${name}:${JSON.stringify(args ?? null)}`);
      return state.rpcResult;
    },
    auth: {
      signOut: async () => {
        calls.push('signOut');
        if (state.signOutThrows) throw new Error('token de alguém@exemplo.com');
        return { error: null };
      },
    },
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        calls.push(`update:${table}`);
        updates.push(values);
        return {
          eq: async (column: string, value: string) => {
            eqs.push(`${column}=${value}`);
            return { error: state.updateError };
          },
        };
      },
    }),
  }),
}));

const { saveAccountName, deleteAccount } = await import('@/app/(public)/conta/actions');

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const IDLE = { status: 'idle', message: '', value: '' } as const;

beforeEach(() => {
  calls.length = 0;
  updates.length = 0;
  eqs.length = 0;
  cookieStore.deleted.length = 0;
  state.user = { id: 'user-1', role: 'member' };
  state.rpcResult = { error: null };
  state.signOutThrows = false;
  state.updateError = null;
  state.publicSessions = [{ id: 's1' }, { id: 's2' }];
  logFailure.mockClear();
  getCurrentUser.mockClear();
});

describe('saveAccountName', () => {
  it('grava só o nome (e a confirmação) da própria pessoa, sem ler o perfil antes', async () => {
    const out = await saveAccountName(IDLE, form({ displayName: '  Maria   Souza ' }));
    expect(out).toEqual({ status: 'ok', message: 'Nome atualizado.', value: 'Maria Souza' });
    expect(Object.keys(updates[0]!).sort()).toEqual(['display_name', 'display_name_confirmed_at']);
    expect(updates[0]!.display_name).toBe('Maria Souza');
    expect(eqs).toEqual(['id=user-1']);
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(calls).toContain('revalidate:/,layout');
  });

  it.each([
    ['', 'Escreva como devemos chamar você.'],
    ['a@b.com', 'Use um nome, não um e-mail'],
    ['x'.repeat(61), 'Use no máximo 60 caracteres.'],
  ])('nome %j é recusado sem tocar no banco', async (name, text) => {
    const out = await saveAccountName(IDLE, form({ displayName: name }));
    expect(out.status).toBe('error');
    expect(out.message).toContain(text);
    expect(out.value).toBe(name);
    expect(calls).toEqual([]);
  });

  it('falha do banco: mensagem em pt-BR e log sem o nome', async () => {
    state.updateError = Object.assign(new Error('falha com Maria'), { code: '08006' });
    const out = await saveAccountName(IDLE, form({ displayName: 'Maria' }));
    expect(out).toMatchObject({ status: 'error', value: 'Maria' });
    expect(logFailure).toHaveBeenCalledTimes(1);
    expect(logFailure.mock.calls[0]![0]).toBe('profiles.update (conta)');
  });
});

describe('deleteAccount', () => {
  const go = (fields: Record<string, string> = { confirmation: 'EXCLUIR' }) =>
    deleteAccount({ error: null }, form(fields));

  it('a equipe é recusada ANTES de qualquer chamada ao banco', async () => {
    for (const role of ['admin', 'moderator']) {
      state.user = { id: 'staff', role };
      const out = await go();
      expect(out.error).toContain('Contas da equipe não podem ser excluídas');
    }
    expect(calls).toEqual([]);
  });

  it.each<Record<string, string>>([
    {},
    { confirmation: '' },
    { confirmation: 'excluir minha conta' },
    { confirmation: 'SIM' },
  ])('sem a confirmação digitada (%j) nada acontece', async (fields) => {
    const out = await go(fields);
    expect(out.error).toBe('Para excluir, digite EXCLUIR no campo.');
    expect(calls).toEqual([]);
  });

  it('aceita a confirmação em minúsculas e com espaços', async () => {
    await expect(go({ confirmation: '  excluir ' })).rejects.toThrow(
      'NEXT_REDIRECT:/conta/excluida',
    );
  });

  it('chama a função do banco SEM argumentos (só age sobre quem está logado), encerra a sessão e limpa os cookies do site', async () => {
    await expect(go()).rejects.toThrow('NEXT_REDIRECT:/conta/excluida');
    expect(calls.filter((c) => c.startsWith('rpc:'))).toEqual(['rpc:delete_my_account:null']);
    expect(calls).toContain('signOut');
    expect(cookieStore.deleted.sort()).toEqual(
      ['ec_progress', 'sb-abc-auth-token', 'sb-abc-auth-token.0'].sort(),
    );
    // A ordem: banco, depois sessão, depois cache, depois o redirect.
    expect(calls.indexOf('rpc:delete_my_account:null')).toBeLessThan(calls.indexOf('signOut'));
    expect(calls.at(-1)).toBe('redirect:/conta/excluida');
  });

  it('expira o cache de comentários de cada sessão pública e as contagens', async () => {
    await expect(go()).rejects.toThrow('NEXT_REDIRECT');
    expect(calls).toEqual(
      expect.arrayContaining(['invalidate:s1', 'invalidate:s2', 'invalidate:counts']),
    );
    expect(calls).toContain('revalidate:/,layout');
  });

  it('o signOut falhar (a conta já não existe) não impede de limpar os cookies nem de sair', async () => {
    state.signOutThrows = true;
    await expect(go()).rejects.toThrow('NEXT_REDIRECT:/conta/excluida');
    expect(cookieStore.deleted).toContain('sb-abc-auth-token');
    expect(JSON.stringify(logFailure.mock.calls)).not.toContain('exemplo.com');
  });

  it.each([
    [{ code: 'P0001', message: 'staff_cannot_delete: x' }, 'Contas da equipe', false],
    [{ code: 'PGRST202', message: 'no function' }, 'ainda não está disponível', false],
    [{ code: '42501', message: 'not_signed_in: x' }, 'Entre de novo', false],
    [{ code: '08006', message: 'connection' }, 'Não foi possível excluir agora', true],
  ])(
    'erro do banco %j: mensagem em pt-BR e a conta fica como está',
    async (error, text, logged) => {
      state.rpcResult = { error };
      const out = await go();
      expect(out.error).toContain(text);
      expect(logFailure).toHaveBeenCalledTimes(logged ? 1 : 0);
      expect(cookieStore.deleted).toEqual([]);
      expect(calls.some((c) => c.startsWith('redirect'))).toBe(false);
    },
  );
});
