import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logFailure } = vi.hoisted(() => ({ logFailure: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/log', () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));

import {
  getDeletionImpact,
  getMaskedEmails,
  getMemberAudit,
  getMemberList,
  getMemberProfile,
  getMembersStats,
} from './queries';

/*
 * As leituras da gestão de membros contra um cliente de mentira que registra cada chamada: o que a lista
 * pede ao banco (nenhum e-mail), os filtros, a página, e o que acontece quando uma leitura falha.
 */

type Call = [method: string, args: unknown[]];
type Outcome = {
  data?: unknown;
  count?: number | null;
  error?: { code?: string; message?: string } | null;
};
type Handler = (table: string, calls: Call[]) => Outcome;

function fakeClient(handler: Handler, rpc?: (name: string, args: unknown) => Outcome) {
  const log: { table: string; calls: Call[] }[] = [];
  const rpcLog: { name: string; args: unknown }[] = [];
  const client = {
    from(table: string) {
      const entry = { table, calls: [] as Call[] };
      log.push(entry);
      const chain: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, method: string) {
            if (method === 'then') {
              const outcome = {
                data: null,
                count: null,
                error: null,
                ...handler(table, entry.calls),
              };
              return (resolve: (value: unknown) => void) => resolve(outcome);
            }
            return (...args: unknown[]) => {
              entry.calls.push([method, args]);
              return chain;
            };
          },
        },
      );
      return chain;
    },
    rpc(name: string, args: unknown) {
      rpcLog.push({ name, args });
      const outcome = { data: null, error: null, ...rpc?.(name, args) };
      return Promise.resolve(outcome);
    },
  };
  return { client: client as never, log, rpcLog };
}

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

const profileRow = (id: string, role = 'member') => ({
  id,
  display_name: `Pessoa ${id.slice(-3)}`,
  role,
  approved_comment_count: 2,
  created_at: '2026-10-01T10:00:00Z',
});

const NOW = new Date('2026-10-05T12:00:00Z');
const has = (calls: Call[], method: string, ...args: unknown[]) =>
  calls.some(([m, a]) => m === method && JSON.stringify(a) === JSON.stringify(args));

beforeEach(() => logFailure.mockClear());

describe('getMemberList', () => {
  const [a, b, c] = ids(3) as [string, string, string];

  it('lista 25 por página, mais novos primeiro, e a lista nunca traz e-mail', async () => {
    const { client, log } = fakeClient((table) =>
      table === 'profiles'
        ? { data: [profileRow(a), profileRow(b, 'moderator'), profileRow(c)], count: 61 }
        : { data: [{ user_id: b }] },
    );
    const result = await getMemberList(client, { filter: 'todos', page: 3, search: '' }, NOW);
    if (!result.ok) throw new Error('esperava ok');
    expect(result.total).toBe(61);
    expect(result.items.map((item) => [item.id, item.role, item.suspended])).toEqual([
      [a, 'member', false],
      [b, 'moderator', true],
      [c, 'member', false],
    ]);

    const profiles = log.find((entry) => entry.table === 'profiles')!;
    expect(has(profiles.calls, 'range', 50, 74)).toBe(true);
    expect(has(profiles.calls, 'order', 'created_at', { ascending: false })).toBe(true);
    expect(has(profiles.calls, 'order', 'id', { ascending: false })).toBe(true);
    // O que se pede ao banco não tem coluna de e-mail; o texto devolvido também não.
    expect(JSON.stringify(log)).not.toMatch(/email/i);
    expect(JSON.stringify(result)).not.toContain('@');
  });

  it('busca por nome: prefixo com os curingas escapados', async () => {
    const { client, log } = fakeClient(() => ({ data: [], count: 0 }));
    await getMemberList(client, { filter: 'todos', page: 1, search: '50%_x' }, NOW);
    const profiles = log.find((entry) => entry.table === 'profiles')!;
    expect(has(profiles.calls, 'ilike', 'display_name', '50\\%\\_x%')).toBe(true);
  });

  it('filtros: equipe, novos (7 dias) e suspensos (join interno)', async () => {
    const equipe = fakeClient(() => ({ data: [], count: 0 }));
    await getMemberList(equipe.client, { filter: 'equipe', page: 1, search: '' }, NOW);
    expect(has(equipe.log[0]!.calls, 'in', 'role', ['admin', 'moderator'])).toBe(true);

    const novos = fakeClient(() => ({ data: [], count: 0 }));
    await getMemberList(novos.client, { filter: 'novos', page: 1, search: '' }, NOW);
    expect(has(novos.log[0]!.calls, 'gte', 'created_at', '2026-09-28T12:00:00.000Z')).toBe(true);

    const suspensos = fakeClient((table) =>
      table === 'profiles' ? { data: [profileRow(a)], count: 1 } : {},
    );
    const result = await getMemberList(
      suspensos.client,
      { filter: 'suspensos', page: 1, search: '' },
      NOW,
    );
    const select = suspensos.log[0]!.calls.find(([m]) => m === 'select')!;
    expect(String(select[1][0])).toContain('member_suspensions!inner(user_id)');
    if (!result.ok) throw new Error('esperava ok');
    expect(result.items[0]!.suspended).toBe(true);
  });

  it('"Suspensos" sem a tabela: pede a atualização do banco; os outros filtros seguem sem a coluna', async () => {
    const missing = fakeClient(() => ({ error: { code: 'PGRST200' } }));
    expect(
      await getMemberList(missing.client, { filter: 'suspensos', page: 1, search: '' }, NOW),
    ).toEqual({ ok: false, reason: 'unavailable' });

    const noTable = fakeClient((table) =>
      table === 'profiles' ? { data: [profileRow(a)], count: 1 } : { error: { code: 'PGRST205' } },
    );
    const result = await getMemberList(
      noTable.client,
      { filter: 'todos', page: 1, search: '' },
      NOW,
    );
    if (!result.ok) throw new Error('esperava ok');
    expect(result.items[0]!.suspended).toBeNull();
    expect(logFailure).not.toHaveBeenCalled();
  });

  it('página além do fim: o PostgREST recusa (PGRST103); a lista pede só o total e devolve vazio', async () => {
    const { client, log } = fakeClient((table, calls) => {
      if (table !== 'profiles') return {};
      return has(calls, 'range', 50, 74)
        ? { error: { code: 'PGRST103', message: 'Requested range not satisfiable' } }
        : { data: [profileRow(a)], count: 27 };
    });
    const result = await getMemberList(client, { filter: 'todos', page: 3, search: '' }, NOW);
    expect(result).toEqual({ ok: true, total: 27, items: [] });
    expect(has(log[1]!.calls, 'range', 0, 0)).toBe(true);
    expect(logFailure).not.toHaveBeenCalled();
  });

  it('erro na leitura dos perfis sobe (a lista falha de forma visível)', async () => {
    const { client } = fakeClient(() => ({ error: { code: '08006' } }));
    await expect(
      getMemberList(client, { filter: 'todos', page: 1, search: '' }, NOW),
    ).rejects.toMatchObject({ code: '08006' });
  });

  it('erro ao ler as suspensões: lista segue, situação desconhecida e erro registrado só pelo código', async () => {
    const { client } = fakeClient((table) =>
      table === 'profiles'
        ? { data: [profileRow(a)], count: 1 }
        : { error: { code: '08006', message: 'detalhe com dados' } },
    );
    const result = await getMemberList(client, { filter: 'todos', page: 1, search: '' }, NOW);
    if (!result.ok) throw new Error('esperava ok');
    expect(result.items[0]!.suspended).toBeNull();
    expect(logFailure).toHaveBeenCalledWith('members.suspensions', expect.anything());
  });
});

describe('getMembersStats', () => {
  it('quatro números reais; uma contagem que falha vira null', async () => {
    const { client } = fakeClient((table, calls) => {
      if (table === 'member_suspensions') return { count: 3 };
      if (has(calls, 'in', 'role', ['admin', 'moderator'])) return { count: 2 };
      if (calls.some(([m]) => m === 'gte')) return { error: { code: '08006' } };
      return { count: 40 };
    });
    expect(await getMembersStats(client, NOW)).toEqual({
      total: 40,
      staff: 2,
      suspended: 3,
      recent: null,
    });
    expect(logFailure).toHaveBeenCalledWith('members.stats.recent', expect.anything());
  });

  it('tabela de suspensões ausente: "—" sem ruído no log', async () => {
    const { client } = fakeClient((table) =>
      table === 'member_suspensions' ? { error: { code: 'PGRST205' } } : { count: 5 },
    );
    const stats = await getMembersStats(client, NOW);
    expect(stats.suspended).toBeNull();
    expect(stats.total).toBe(5);
    expect(logFailure).not.toHaveBeenCalled();
  });
});

describe('getMaskedEmails', () => {
  const [a, b] = ids(2) as [string, string];

  it('sem ids não chama o banco', async () => {
    const { client, rpcLog } = fakeClient(() => ({}));
    expect(await getMaskedEmails(client, [])).toEqual({ status: 'ok', byId: new Map() });
    expect(rpcLog).toEqual([]);
  });

  it('devolve só o e-mail mascarado de cada id', async () => {
    const { client, rpcLog } = fakeClient(
      () => ({}),
      () => ({
        data: [
          { user_id: a, masked_email: 'f***@exemplo.com' },
          { user_id: b, masked_email: '***' },
        ],
      }),
    );
    const result = await getMaskedEmails(client, [a, b]);
    expect(result).toEqual({
      status: 'ok',
      byId: new Map([
        [a, 'f***@exemplo.com'],
        [b, '***'],
      ]),
    });
    expect(rpcLog).toEqual([{ name: 'admin_masked_emails', args: { p_user_ids: [a, b] } }]);
  });

  it('contact_unavailable, função ausente e erro genérico são casos separados', async () => {
    const run = async (error: { code: string; message: string }) =>
      getMaskedEmails(
        fakeClient(
          () => ({}),
          () => ({ error }),
        ).client,
        [a],
      );
    expect(await run({ code: 'P0001', message: 'contact_unavailable: x' })).toEqual({
      status: 'contact_unavailable',
    });
    expect(await run({ code: 'PGRST202', message: 'x' })).toEqual({ status: 'pending' });
    expect(logFailure).not.toHaveBeenCalled();
    expect(await run({ code: 'XX000', message: 'a***@b.com' })).toEqual({ status: 'error' });
    expect(logFailure).toHaveBeenCalledWith('members.masked-emails', expect.anything());
  });
});

describe('getMemberProfile e getDeletionImpact', () => {
  const [a] = ids(1) as [string];

  it('perfil inexistente é null; erro sobe', async () => {
    expect(await getMemberProfile(fakeClient(() => ({ data: null })).client, a)).toBeNull();
    await expect(
      getMemberProfile(fakeClient(() => ({ error: { code: '08006' } })).client, a),
    ).rejects.toMatchObject({ code: '08006' });
  });

  it('o impacto da exclusão conta comentários dela e respostas de OUTRAS pessoas aos comentários dela', async () => {
    const { client, log } = fakeClient((table, calls) => {
      if (table !== 'comments') return {};
      return calls.some(([m]) => m === 'neq') ? { count: 7 } : { count: 4 };
    });
    expect(await getDeletionImpact(client, a)).toEqual({ comments: 4, replies: 7 });
    const [own, replies] = log.map((entry) => entry.calls);
    expect(has(own!, 'eq', 'author_id', a)).toBe(true);
    expect(has(replies!, 'eq', 'parent.author_id', a)).toBe(true);
    expect(has(replies!, 'neq', 'author_id', a)).toBe(true);
  });

  it('contagem que falha vira null (o diálogo avisa que não conseguiu contar)', async () => {
    const { client } = fakeClient(() => ({ error: { code: '08006' } }));
    expect(await getDeletionImpact(client, a)).toEqual({ comments: null, replies: null });
  });
});

describe('getMemberAudit', () => {
  const [target, actor, gone] = ids(3) as [string, string, string];

  it('últimas 50 sobre a pessoa, com o nome de quem agiu e conta excluída sem nome', async () => {
    const { client, log } = fakeClient((table) =>
      table === 'member_audit'
        ? {
            data: [
              {
                id: 'a1',
                actor_id: actor,
                action: 'suspend',
                details: {},
                created_at: '2026-10-05T10:00:00Z',
              },
              {
                id: 'a2',
                actor_id: gone,
                action: 'view_contact',
                details: {},
                created_at: '2026-10-05T09:00:00Z',
              },
            ],
          }
        : { data: [{ id: actor, display_name: 'Ana' }] },
    );
    const audit = await getMemberAudit(client, target);
    if (audit.status !== 'ok') throw new Error('esperava ok');
    expect(audit.entries.map((entry) => entry.actorName)).toEqual(['Ana', null]);
    const calls = log.find((entry) => entry.table === 'member_audit')!.calls;
    expect(has(calls, 'eq', 'target_id', target)).toBe(true);
    expect(has(calls, 'limit', 50)).toBe(true);
  });

  it('tabela ausente: pendente; erro: registrado e a página segue', async () => {
    expect(
      await getMemberAudit(fakeClient(() => ({ error: { code: 'PGRST205' } })).client, target),
    ).toEqual({ status: 'pending' });
    expect(
      await getMemberAudit(fakeClient(() => ({ error: { code: '08006' } })).client, target),
    ).toEqual({ status: 'error' });
    expect(logFailure).toHaveBeenCalledWith('members.audit', expect.anything());
  });
});
