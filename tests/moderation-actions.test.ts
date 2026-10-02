import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * As actions de moderação com o Supabase trocado por um dublê. O que importa: o papel é conferido em CADA
 * action; toda mudança é `UPDATE … WHERE status = <esperado>` (conflito vira mensagem em pt-BR); e o "Aprovar
 * os sem alerta" aprova só o que o servidor confirma como pendente e sem alerta, entre os ids da página.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SESSION = '4f1c2a9e-1b2c-4d3e-8f4a-5b6c7d8e9f00';

type Update = { values: unknown; filters: Record<string, unknown> };
const calls: string[] = [];
const updates: Update[] = [];
const state = {
  updated: [{ id: id(1), session_id: SESSION }] as { id: string; session_id: string }[],
  updateError: null as { code?: string } | null,
  rows: [] as { id: string; status: string; flag: { reason: string } | null }[],
  session: { session: { chapter_to: 12, books: { total_chapters: 52 } } } as unknown,
};

const requireRole = vi.fn(async (role: string) => ({
  id: 'u1',
  role: role === 'staff' ? 'moderator' : 'admin',
}));
vi.mock('@/lib/auth/session', () => ({ requireRole: (role: string) => requireRole(role) }));
vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => void calls.push(`revalidate:${a.join(',')}`),
}));
vi.mock('@/lib/public/tags', () => ({
  invalidateComments: (sessionId: string) => void calls.push(`invalidate:${sessionId}`),
}));
const logFailure = vi.fn();
vi.mock('@/lib/auth/log', () => ({ logFailure: (...a: unknown[]) => logFailure(...a) }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      update: (values: unknown) => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (column: string, value: unknown) => ((filters[`eq:${column}`] = value), chain),
          in: (column: string, value: unknown) => ((filters[`in:${column}`] = value), chain),
          select: async () => {
            updates.push({ values, filters });
            return { data: state.updateError ? null : state.updated, error: state.updateError };
          },
        };
        return chain;
      },
      select: () => ({
        in: async () => ({ data: state.rows, error: null }),
        eq: () => ({ maybeSingle: async () => ({ data: state.session, error: null }) }),
      }),
    }),
  }),
}));

const actions = await import('@/app/painel/comentarios/actions');

beforeEach(() => {
  calls.length = 0;
  updates.length = 0;
  state.updated = [{ id: id(1), session_id: SESSION }];
  state.updateError = null;
  state.rows = [];
  state.session = { session: { chapter_to: 12, books: { total_chapters: 52 } } };
  requireRole.mockClear();
  logFailure.mockClear();
});

describe('papel', () => {
  it.each([
    ['approveComment', () => actions.approveComment(id(1))],
    ['removeComment', () => actions.removeComment(id(1))],
    ['restoreComment', () => actions.restoreComment(id(1))],
    ['approveAsSpoiler', () => actions.approveAsSpoiler(id(1), 14)],
    ['setCommentSpoiler', () => actions.setCommentSpoiler(id(1), null)],
    ['approveUnflaggedOnPage', () => actions.approveUnflaggedOnPage([id(1)])],
  ])('%s confere o papel "staff" antes de qualquer coisa', async (_name, run) => {
    await run();
    expect(requireRole).toHaveBeenCalledWith('staff');
  });

  it('sem permissão (403 do requireRole) nada é consultado nem gravado', async () => {
    requireRole.mockRejectedValueOnce(new Error('NEXT_HTTP_ERROR_FALLBACK;403'));
    await expect(actions.approveComment(id(1))).rejects.toThrow('403');
    expect(updates).toEqual([]);
  });
});

describe('mudanças de estado (UPDATE … WHERE status = esperado)', () => {
  it('aprovar: só de pendente', async () => {
    const out = await actions.approveComment(id(1));
    expect(out).toEqual({ ok: true, message: 'Comentário aprovado.' });
    expect(updates[0]).toEqual({
      values: { status: 'approved' },
      filters: { 'eq:id': id(1), 'in:status': ['pending'] },
    });
  });

  it('remover: de pendente ou aprovado (nunca apaga)', async () => {
    await actions.removeComment(id(1));
    expect(updates[0]!.values).toEqual({ status: 'removed' });
    expect(updates[0]!.filters['in:status']).toEqual(['pending', 'approved']);
  });

  it('restaurar: só de removido, e volta para PENDENTE', async () => {
    const out = await actions.restoreComment(id(1));
    expect(updates[0]!.values).toEqual({ status: 'pending' });
    expect(updates[0]!.filters['in:status']).toEqual(['removed']);
    expect(out.ok && out.message).toContain('Para aprovar');
  });

  it('depois de moderar: expira a lista pública da sessão e refaz o painel (contador)', async () => {
    await actions.approveComment(id(1));
    expect(calls).toContain(`invalidate:${SESSION}`);
    expect(calls).toContain('revalidate:/painel,layout');
  });

  it('conflito: outra pessoa já moderou (nenhuma linha mudou) → mensagem em pt-BR, sem invalidar', async () => {
    state.updated = [];
    const out = await actions.approveComment(id(1));
    expect(out).toEqual({
      ok: false,
      message: 'Outra pessoa já moderou este comentário. Atualize a página.',
    });
    expect(calls).toEqual([]);
  });

  it('id que não é uuid: pedido inválido, sem consulta', async () => {
    expect(await actions.approveComment('x')).toMatchObject({ ok: false });
    expect(await actions.removeComment("'; drop table comments")).toMatchObject({ ok: false });
    expect(updates).toEqual([]);
  });

  it('erro do banco: mensagem genérica e log só do erro', async () => {
    state.updateError = { code: '08006' };
    const out = await actions.approveComment(id(1));
    expect(out.ok).toBe(false);
    expect(logFailure).toHaveBeenCalledWith('comments.moderate', expect.anything());
  });

  it('RLS recusou (42501): "só a equipe", sem log de erro inesperado', async () => {
    state.updateError = { code: '42501' };
    const out = await actions.approveComment(id(1));
    expect(out).toMatchObject({ ok: false, message: 'Só a equipe pode moderar comentários.' });
    expect(logFailure).not.toHaveBeenCalled();
  });
});

describe('spoiler', () => {
  it('aprovar como spoiler: status e capítulo na mesma gravação', async () => {
    const out = await actions.approveAsSpoiler(id(1), 14);
    expect(out).toMatchObject({ ok: true });
    expect(updates[0]!.values).toEqual({ status: 'approved', spoiler_up_to: 14 });
    expect(updates[0]!.filters['in:status']).toEqual(['pending']);
  });

  it.each([12, 11, 53, 1.5, 'abc', null, undefined, '0'])(
    'capítulo inválido %j é recusado',
    async (upTo) => {
      expect(await actions.approveAsSpoiler(id(1), upTo)).toMatchObject({
        ok: false,
        message: 'Escolha um capítulo válido para o aviso de spoiler.',
      });
      expect(updates).toEqual([]);
    },
  );

  it('tirar spoiler: só de aprovado, com spoiler_up_to nulo', async () => {
    await actions.setCommentSpoiler(id(1), null);
    expect(updates[0]).toEqual({
      values: { spoiler_up_to: null },
      filters: { 'eq:id': id(1), 'in:status': ['approved'] },
    });
  });

  it('marcar spoiler valida a faixa da sessão do comentário', async () => {
    expect(await actions.setCommentSpoiler(id(1), 30)).toMatchObject({ ok: true });
    expect(updates[0]!.values).toEqual({ spoiler_up_to: 30 });
    expect(await actions.setCommentSpoiler(id(1), 5)).toMatchObject({ ok: false });
  });

  it('comentário cuja sessão não existe mais', async () => {
    state.session = { session: null };
    expect(await actions.approveAsSpoiler(id(1), 14)).toEqual({
      ok: false,
      message: 'Comentário não encontrado. Atualize a página.',
    });
  });
});

describe('"Aprovar os sem alerta desta página"', () => {
  const row = (n: number, status: string, flag: string | null = null) => ({
    id: id(n),
    status,
    flag: flag ? { reason: flag } : null,
  });

  it('aprova só os pendentes SEM alerta e ignora todo o resto', async () => {
    state.rows = [
      row(1, 'pending'),
      row(2, 'pending', 'Contém link'),
      row(3, 'approved'),
      row(4, 'removed'),
      row(5, 'pending'),
    ];
    state.updated = [
      { id: id(1), session_id: SESSION },
      { id: id(5), session_id: SESSION },
    ];
    // O cliente diz ver 1, 2, 3, 4, 5 e 6 (o 6 nem existe).
    const out = await actions.approveUnflaggedOnPage([id(1), id(2), id(3), id(4), id(5), id(6)]);
    expect(out).toEqual({ ok: true, message: '2 comentários sem alerta aprovados.' });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.values).toEqual({ status: 'approved' });
    expect(updates[0]!.filters['in:id']).toEqual([id(1), id(5)]);
    // E de novo a guarda de estado no próprio UPDATE.
    expect(updates[0]!.filters['eq:status']).toBe('pending');
  });

  it('um comentário com alerta NUNCA entra, mesmo que o cliente o mande', async () => {
    state.rows = [row(2, 'pending', 'Provável spam')];
    const out = await actions.approveUnflaggedOnPage([id(2)]);
    expect(out).toEqual({
      ok: true,
      message: 'Nenhum comentário sem alerta para aprovar nesta página.',
    });
    expect(updates).toEqual([]);
  });

  it('não aprova ids que a tela não mandou (só os enviados são considerados)', async () => {
    // O banco tem outros pendentes sem alerta (7, 8), mas a página só mandou o 1.
    state.rows = [row(1, 'pending'), row(7, 'pending'), row(8, 'pending')];
    state.updated = [{ id: id(1), session_id: SESSION }];
    await actions.approveUnflaggedOnPage([id(1)]);
    expect(updates[0]!.filters['in:id']).toEqual([id(1)]);
  });

  it('no máximo 20 ids por chamada, sem repetição, só uuid válido', async () => {
    const many = Array.from({ length: 50 }, (_, i) => id(i + 1));
    state.rows = many.map((m, i) => row(i + 1, 'pending'));
    state.updated = [];
    await actions.approveUnflaggedOnPage([...many, many[0], 'x', 5]);
    expect((updates[0]!.filters['in:id'] as string[]).length).toBe(20);
  });

  it('lista vazia ou inválida: pedido inválido, sem consulta', async () => {
    for (const bad of [[], 'x', null, ['x', 3]]) {
      expect(await actions.approveUnflaggedOnPage(bad)).toMatchObject({ ok: false });
    }
    expect(updates).toEqual([]);
  });

  it('expira o cache das sessões afetadas e refaz o painel', async () => {
    state.rows = [row(1, 'pending')];
    state.updated = [{ id: id(1), session_id: SESSION }];
    await actions.approveUnflaggedOnPage([id(1)]);
    expect(calls).toContain(`invalidate:${SESSION}`);
    expect(calls).toContain('revalidate:/painel,layout');
  });

  it('singular quando é um só', async () => {
    state.rows = [row(1, 'pending')];
    state.updated = [{ id: id(1), session_id: SESSION }];
    expect(await actions.approveUnflaggedOnPage([id(1)])).toEqual({
      ok: true,
      message: '1 comentário sem alerta aprovado.',
    });
  });
});
