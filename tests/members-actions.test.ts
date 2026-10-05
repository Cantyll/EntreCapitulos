import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * As Server Actions da gestão de membros, com o Supabase trocado por um dublê. O que importa: o papel é conferido
 * antes de tudo, o cliente só escolhe o que a tela mostra, os textos digitados são conferidos no servidor, os
 * erros do banco viram pt-BR, o cache certo expira, e o log nunca leva e-mail nem nome.
 */

const ID = 'aaaaaaaa-1111-4222-8333-444444444444';
const EMAIL = 'fulana.silva@exemplo.com';

const calls: string[] = [];
const state = {
  profileName: 'Fulana Silva',
  rpc: {} as Record<string, { data?: unknown; error?: { code?: string; message?: string } | null }>,
  commentSessions: [{ session_id: 's1' }, { session_id: 's1' }, { session_id: 's2' }] as {
    session_id: string;
  }[],
  commentsError: null as { code: string } | null,
  commentsRows: undefined as unknown[] | undefined,
  publicSessions: [{ id: 'p1' }, { id: 'p2' }] as { id: string }[],
  role: 'admin' as 'admin' | 'moderator' | 'member',
};

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => void calls.push(`revalidate:${args.join(',')}`),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    calls.push(`redirect:${path}`);
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock('@/lib/auth/session', () => ({
  requireRole: async (requirement: string) => {
    calls.push(`requireRole:${requirement}`);
    if (state.role !== 'admin') throw new Error('FORBIDDEN');
    return { id: 'admin-1', role: 'admin' };
  },
}));
vi.mock('@/lib/public/queries', () => ({ getPublicSessions: async () => state.publicSessions }));
vi.mock('@/lib/public/tags', () => ({
  invalidateComments: (id?: string) => void calls.push(`invalidate:${id ?? 'counts'}`),
}));
const logFailure = vi.fn();
vi.mock('@/lib/auth/log', () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async (name: string, args?: unknown) => {
      calls.push(`rpc:${name}:${JSON.stringify(args ?? null)}`);
      return { data: null, error: null, ...state.rpc[name] };
    },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.limit = async () =>
        table === 'comments'
          ? state.commentsError
            ? { data: null, error: state.commentsError }
            : { data: state.commentsRows ?? state.commentSessions, error: null }
          : { data: [], error: null };
      chain.maybeSingle = async () => ({
        data: table === 'profiles' ? { display_name: state.profileName } : null,
        error: null,
      });
      return chain;
    },
  }),
}));

const { changeMemberRole, deleteMember, searchMembers, setMemberSuspension, showMemberContact } =
  await import('@/app/painel/membros/actions');

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const IDLE = { status: 'idle' } as const;
const rpcCalls = () => calls.filter((call) => call.startsWith('rpc:'));
const redirectOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return (error as Error).message;
  }
  return null;
};

beforeEach(() => {
  calls.length = 0;
  state.profileName = 'Fulana Silva';
  state.rpc = {};
  state.commentsError = null;
  state.commentsRows = undefined;
  state.publicSessions = [{ id: 'p1' }, { id: 'p2' }];
  state.role = 'admin';
  logFailure.mockClear();
});

describe('quem não é da administração', () => {
  it.each([
    ['changeMemberRole', () => changeMemberRole(ID, 'member', 'moderator', '')],
    ['setMemberSuspension', () => setMemberSuspension(ID, true)],
    ['showMemberContact', () => showMemberContact(ID)],
    ['deleteMember', () => deleteMember(ID, 'EXCLUIR')],
    ['searchMembers', () => searchMembers(IDLE, form({ q: EMAIL }))],
  ])('%s recusa antes de tocar no banco', async (_name, run) => {
    state.role = 'moderator';
    await expect(run()).rejects.toThrow('FORBIDDEN');
    expect(rpcCalls()).toEqual([]);
    expect(calls[0]).toBe('requireRole:admin');
  });
});

describe('changeMemberRole', () => {
  it('id inválido, cargo fora da lista e cargo esperado inválido nem chegam ao banco', async () => {
    expect(await changeMemberRole('nao-e-uuid', 'member', 'member', '')).toMatchObject({
      ok: false,
      code: 'invalid_id',
    });
    expect(await changeMemberRole(ID, 'dono', 'member', '')).toMatchObject({
      ok: false,
      code: 'invalid_role',
    });
    expect(await changeMemberRole(ID, 'member', 'rei', '')).toMatchObject({
      ok: false,
      code: 'invalid_input',
    });
    expect(rpcCalls()).toEqual([]);
  });

  it('Administração exige o nome digitado, conferido no servidor (sem chamar a função do banco)', async () => {
    const wrong = await changeMemberRole(ID, 'admin', 'member', 'Outra Pessoa');
    expect(wrong).toMatchObject({ ok: false, code: 'confirm_name' });
    expect(rpcCalls()).toEqual([]);

    state.rpc.set_member_role = { data: 'member' };
    const ok = await changeMemberRole(ID, 'admin', 'member', '  fulana   SILVA ');
    expect(ok).toMatchObject({ ok: true, changed: true });
    expect(rpcCalls()).toEqual([
      `rpc:set_member_role:${JSON.stringify({ p_user_id: ID, p_role: 'admin', p_expected_role: 'member' })}`,
    ]);
  });

  it('Moderação e Membro não pedem nome; o cargo que a tela mostrava vai como p_expected_role', async () => {
    state.rpc.set_member_role = { data: 'moderator' };
    const result = await changeMemberRole(ID, 'member', 'moderator', '');
    expect(result).toEqual({
      ok: true,
      changed: true,
      message: 'Cargo alterado: Moderação → Membro.',
    });
    expect(rpcCalls()[0]).toContain('"p_expected_role":"moderator"');
  });

  it('mesmo cargo: "Nada mudou", sem expirar nada', async () => {
    state.rpc.set_member_role = { data: 'member' };
    const result = await changeMemberRole(ID, 'member', 'member', '');
    expect(result).toEqual({
      ok: true,
      changed: false,
      message: 'A pessoa já tinha o cargo Membro. Nada mudou.',
    });
    expect(
      calls.filter((call) => call.startsWith('invalidate:') || call.startsWith('revalidate:')),
    ).toEqual([]);
  });

  it('mudou: expira só as sessões em que a pessoa comentou, as contagens e refaz o layout do painel', async () => {
    state.rpc.set_member_role = { data: 'member' };
    await changeMemberRole(ID, 'moderator', 'member', '');
    expect(calls.filter((call) => call.startsWith('invalidate:')).sort()).toEqual([
      'invalidate:counts',
      'invalidate:s1',
      'invalidate:s2',
    ]);
    expect(calls).toContain('revalidate:/painel,layout');
  });

  it('se a consulta das sessões falhar, ou houver comentários demais, expira todas as públicas', async () => {
    state.rpc.set_member_role = { data: 'member' };
    state.commentsError = { code: '08006' };
    await changeMemberRole(ID, 'moderator', 'member', '');
    expect(calls.filter((call) => call.startsWith('invalidate:')).sort()).toEqual([
      'invalidate:counts',
      'invalidate:p1',
      'invalidate:p2',
    ]);
    expect(logFailure).toHaveBeenCalledWith('members.invalidate', expect.anything());

    calls.length = 0;
    state.commentsError = null;
    state.commentsRows = Array.from({ length: 1000 }, () => ({ session_id: 's1' }));
    await changeMemberRole(ID, 'moderator', 'member', '');
    expect(calls.filter((call) => call.startsWith('invalidate:')).sort()).toEqual([
      'invalidate:counts',
      'invalidate:p1',
      'invalidate:p2',
    ]);
  });

  it.each([
    ['role_conflict', { code: 'P0001', message: 'role_conflict: x' }, 'cargo desta pessoa mudou'],
    ['last_admin', { code: 'P0001', message: 'last_admin: x' }, 'última conta de Administração'],
    ['self_change', { code: 'P0001', message: 'self_change: x' }, 'própria conta'],
    [
      'member_suspended',
      { code: 'P0001', message: 'member_suspended: x' },
      'Reative os comentários',
    ],
    ['target_anonymous', { code: 'P0001', message: 'target_anonymous: x' }, 'conta anônima'],
    ['not_admin', { code: '42501', message: 'not_admin: x' }, 'Só a administração'],
    ['função ausente', { code: 'PGRST202', message: 'x' }, 'Falta aplicar a atualização do banco'],
    ['trava', { code: '57014', message: 'canceling' }, 'nada foi alterado'],
  ])('erro do banco %s vira pt-BR e nada expira', async (_name, error, text) => {
    state.rpc.set_member_role = { error };
    const result = await changeMemberRole(ID, 'member', 'moderator', '');
    expect(result.ok).toBe(false);
    expect(result.message).toContain(text);
    expect(calls.filter((call) => call.startsWith('invalidate:'))).toEqual([]);
  });

  it('só o erro inesperado vai para o log, e o log nunca leva nome nem e-mail', async () => {
    state.rpc.set_member_role = { error: { code: '42501', message: 'not_admin: x' } };
    await changeMemberRole(ID, 'member', 'moderator', '');
    expect(logFailure).not.toHaveBeenCalled();

    state.rpc.set_member_role = {
      error: { code: 'XX000', message: `falha com ${EMAIL} Fulana Silva` },
    };
    await changeMemberRole(ID, 'member', 'moderator', '');
    expect(logFailure).toHaveBeenCalledTimes(1);
    const [, logged] = logFailure.mock.calls[0]!;
    // O dublê recebe o objeto de erro inteiro; quem filtra é `logFailure` (só nome e códigos). O rótulo não tem dados.
    expect(logFailure.mock.calls[0]![0]).toBe('members.role');
    expect(JSON.stringify(logFailure.mock.calls[0]![0])).not.toContain('Fulana');
    expect(logged).toBeDefined();
  });
});

describe('setMemberSuspension', () => {
  it('valor que não é booleano e id inválido são recusados sem tocar no banco', async () => {
    expect(await setMemberSuspension(ID, 'sim')).toMatchObject({
      ok: false,
      code: 'invalid_input',
    });
    expect(await setMemberSuspension('x', true)).toMatchObject({ ok: false, code: 'invalid_id' });
    expect(rpcCalls()).toEqual([]);
  });

  it('suspender e reativar: resultado em pt-BR, só o painel é refeito (nada público expira)', async () => {
    state.rpc.set_member_suspension = { data: true };
    expect(await setMemberSuspension(ID, true)).toEqual({
      ok: true,
      changed: true,
      message: 'Comentários suspensos.',
    });
    expect(await setMemberSuspension(ID, false)).toMatchObject({
      message: 'Comentários reativados.',
    });
    expect(calls.filter((call) => call.startsWith('invalidate:'))).toEqual([]);
    expect(calls).toContain('revalidate:/painel,layout');
  });

  it('idempotente: já estava assim, "Nada mudou"', async () => {
    state.rpc.set_member_suspension = { data: false };
    expect(await setMemberSuspension(ID, true)).toEqual({
      ok: true,
      changed: false,
      message: 'Os comentários desta pessoa já estavam suspensos. Nada mudou.',
    });
  });

  it('equipe e a própria conta o banco recusa', async () => {
    state.rpc.set_member_suspension = { error: { code: 'P0001', message: 'staff_target: x' } };
    expect((await setMemberSuspension(ID, true)).message).toMatch(/[Mm]ude o cargo para Membro/);
    state.rpc.set_member_suspension = { error: { code: 'P0001', message: 'self_change: x' } };
    expect((await setMemberSuspension(ID, true)).message).toContain('própria conta');
  });
});

describe('showMemberContact', () => {
  it('devolve e-mail, último acesso e provedores só a quem pediu, sem revalidar nem expirar nada', async () => {
    state.rpc.admin_member_contact = {
      data: [
        { email: EMAIL, last_sign_in_at: '2026-10-01T00:00:00Z', providers: ['email', 'google'] },
      ],
    };
    const result = await showMemberContact(ID);
    expect(result).toEqual({
      ok: true,
      email: EMAIL,
      lastSignInAt: '2026-10-01T00:00:00Z',
      providers: ['email', 'google'],
    });
    expect(
      calls.filter((call) => call.startsWith('revalidate:') || call.startsWith('invalidate:')),
    ).toEqual([]);
    expect(logFailure).not.toHaveBeenCalled();
  });

  it('contact_unavailable: mensagem clara, sem e-mail, sem log', async () => {
    state.rpc.admin_member_contact = {
      error: { code: 'P0001', message: 'contact_unavailable: the database cannot read' },
    };
    const result = await showMemberContact(ID);
    expect(result).toMatchObject({ ok: false, code: 'contact_unavailable' });
    expect(JSON.stringify(result)).not.toContain('@');
    expect(logFailure).not.toHaveBeenCalled();
  });

  it('id inválido e pessoa inexistente', async () => {
    expect(await showMemberContact('x')).toMatchObject({ ok: false, code: 'invalid_id' });
    state.rpc.admin_member_contact = { data: [] };
    expect(await showMemberContact(ID)).toMatchObject({ ok: false, code: 'target_not_found' });
  });
});

describe('deleteMember', () => {
  it('a confirmação digitada é conferida no servidor, antes do banco', async () => {
    expect(await deleteMember(ID, 'excluir agora')).toMatchObject({
      ok: false,
      code: 'confirm_delete',
    });
    expect(await deleteMember(ID, undefined)).toMatchObject({ ok: false, code: 'confirm_delete' });
    expect(await deleteMember('x', 'EXCLUIR')).toMatchObject({ ok: false, code: 'invalid_id' });
    expect(rpcCalls()).toEqual([]);
  });

  it('aceita "excluir" em minúsculas e com espaços, expira tudo e volta para a lista com o aviso', async () => {
    const redirect = await redirectOf(() => deleteMember(ID, '  excluir '));
    expect(redirect).toBe('NEXT_REDIRECT:/painel/membros?aviso=conta-excluida');
    expect(rpcCalls()).toEqual([`rpc:admin_delete_member:${JSON.stringify({ p_user_id: ID })}`]);
    expect(calls.filter((call) => call.startsWith('invalidate:')).sort()).toEqual([
      'invalidate:counts',
      'invalidate:p1',
      'invalidate:p2',
    ]);
    expect(calls).toContain('revalidate:/painel,layout');
  });

  it('equipe e a própria conta o banco recusa, e nada expira nem redireciona', async () => {
    state.rpc.admin_delete_member = { error: { code: 'P0001', message: 'staff_cannot_delete: x' } };
    const result = await deleteMember(ID, 'EXCLUIR');
    expect(result).toMatchObject({ ok: false, code: 'staff_cannot_delete' });
    expect(result.message).toMatch(/[Mm]ude o cargo para Membro/);
    expect(
      calls.filter((call) => call.startsWith('invalidate:') || call.startsWith('redirect:')),
    ).toEqual([]);
    state.rpc.admin_delete_member = { error: { code: 'P0001', message: 'self_change: x' } };
    expect(await deleteMember(ID, 'EXCLUIR')).toMatchObject({ code: 'self_change' });
  });
});

describe('searchMembers', () => {
  it('texto com @ é e-mail: vai ao banco por POST (RPC), nunca vira URL, e leva ao perfil por uuid', async () => {
    state.rpc.admin_find_member_by_email = { data: ID };
    const redirect = await redirectOf(() => searchMembers(IDLE, form({ q: `  ${EMAIL} ` })));
    expect(redirect).toBe(`NEXT_REDIRECT:/painel/membros/${ID}`);
    expect(redirect).not.toContain('@');
    expect(rpcCalls()[0]).toContain(EMAIL);
    expect(calls.filter((call) => call.startsWith('redirect:')).join()).not.toContain('@');
  });

  it('e-mail que não existe: mensagem fixa, sem repetir o e-mail', async () => {
    state.rpc.admin_find_member_by_email = { data: null };
    const result = await searchMembers(IDLE, form({ q: EMAIL }));
    expect(result).toEqual({ status: 'error', message: 'Nenhuma pessoa com esse e-mail.' });
    expect(JSON.stringify(result)).not.toContain('fulana');
  });

  it('banco sem acesso aos dados da conta: aviso claro, sem e-mail e sem log', async () => {
    state.rpc.admin_find_member_by_email = {
      error: { code: 'P0001', message: 'contact_unavailable: x' },
    };
    const result = await searchMembers(IDLE, form({ q: EMAIL }));
    expect(result.status).toBe('error');
    expect(JSON.stringify(result)).not.toContain('@');
    expect(logFailure).not.toHaveBeenCalled();
  });

  it('erro inesperado: mensagem genérica, log só com o rótulo e o erro', async () => {
    state.rpc.admin_find_member_by_email = { error: { code: 'XX000', message: `x ${EMAIL}` } };
    await searchMembers(IDLE, form({ q: EMAIL }));
    expect(logFailure).toHaveBeenCalledWith('members.find-by-email', expect.anything());
    expect(logFailure.mock.calls[0]![0]).not.toContain('@');
  });

  it('resposta que não é uuid não vira redirecionamento', async () => {
    state.rpc.admin_find_member_by_email = { data: '../../etc' };
    const result = await searchMembers(IDLE, form({ q: EMAIL }));
    expect(result.status).toBe('error');
    expect(calls.filter((call) => call.startsWith('redirect:'))).toEqual([]);
  });

  it('nome: vira ?busca= (público), mantém o filtro, e nunca chama a busca por e-mail', async () => {
    const redirect = await redirectOf(() =>
      searchMembers(IDLE, form({ q: '  João   da Silva ', filtro: 'equipe' })),
    );
    expect(redirect).toBe('NEXT_REDIRECT:/painel/membros?filtro=equipe&busca=Jo%C3%A3o+da+Silva');
    expect(rpcCalls()).toEqual([]);
  });

  it('caixa vazia limpa a busca; filtro desconhecido vira "todos"', async () => {
    expect(await redirectOf(() => searchMembers(IDLE, form({ q: '   ', filtro: 'xyz' })))).toBe(
      'NEXT_REDIRECT:/painel/membros',
    );
  });
});
