import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * `POST /painel/membros/[id]/dados`, com o Supabase trocado por um dublê. O que importa: a origem é conferida antes
 * de tudo, o papel antes de ler, o id é validado, `admin_member_export` roda POR ÚLTIMO (a auditoria só existe se o
 * arquivo foi montado), `contact_unavailable` e payload de outra pessoa não geram arquivo, e o arquivo é só da
 * pessoa pedida, com o nome sem dados dela. Complementa os testes de texto de `members-static.test.ts`.
 */

const ID = 'aaaaaaaa-1111-4222-8333-444444444444';
const OTHER_ID = 'bbbbbbbb-1111-4222-8333-444444444444';
const EMAIL = 'fulana.silva@exemplo.com';

const calls: string[] = [];
const state = {
  role: 'admin' as 'admin' | 'moderator',
  profile: { display_name: 'Fulana Silva' } as Record<string, unknown> | null,
  suspension: null as { user_id: string } | null,
  suspensionError: null as { code?: string; message?: string } | null,
  rpcResult: undefined as
    { data?: unknown; error?: { code?: string; message?: string } } | undefined,
  commentsOfAuthor: [] as unknown[],
};

const payload = (id = ID) => ({
  account: {
    id,
    email: EMAIL,
    created_at: '2026-01-02T10:00:00Z',
    last_sign_in_at: '2026-09-30T10:00:00Z',
    providers: ['email'],
  },
  progress: [
    { chapter: 12, updated_at: '2026-09-29T10:00:00Z', book_slug: 'azrael', book_title: 'Azrael' },
  ],
  terms: {
    version: '2026-10-06',
    accepted_at: '2026-10-07T12:00:00Z',
    first_accepted_at: '2026-10-06T09:30:00Z',
  },
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({
  requireRole: async (requirement: string) => {
    calls.push(`requireRole:${requirement}`);
    if (state.role !== 'admin') throw new Error('FORBIDDEN');
    return { id: 'admin-1', role: 'admin' };
  },
}));
const logFailure = vi.fn();
vi.mock('@/lib/auth/log', () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    calls.push('createClient');
    return {
      rpc: async (name: string, args: unknown) => {
        calls.push(`rpc:${name}:${JSON.stringify(args)}`);
        return state.rpcResult ?? { data: payload(), error: null };
      },
      from: (table: string) => {
        calls.push(`from:${table}`);
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (column: string, value: unknown) => {
          calls.push(`eq:${table}.${column}=${String(value)}`);
          return chain;
        };
        chain.order = () => chain;
        chain.range = async () => ({ data: state.commentsOfAuthor, error: null });
        chain.maybeSingle = async () =>
          table === 'profiles'
            ? { data: state.profile, error: null }
            : { data: state.suspension, error: state.suspensionError };
        return chain;
      },
    };
  },
}));

const route = await import('@/app/painel/membros/[id]/dados/route');

const post = (
  id: string = ID,
  headers: Record<string, string> = { origin: 'https://site.test', host: 'site.test' },
) =>
  route.POST(
    new Request(`https://site.test/painel/membros/${id}/dados`, { method: 'POST', headers }),
    { params: Promise.resolve({ id }) } as never,
  );

beforeEach(() => {
  calls.length = 0;
  state.role = 'admin';
  state.profile = { display_name: 'Fulana Silva' };
  state.suspension = null;
  state.suspensionError = null;
  state.rpcResult = undefined;
  state.commentsOfAuthor = [];
  logFailure.mockClear();
});

describe('origem, papel e id', () => {
  it('só exporta POST', () => {
    expect(Object.keys(route).filter((key) => key !== 'default')).toEqual(['POST']);
  });

  it.each([
    ['sem Origin', { host: 'site.test' }],
    ['Origin de outro site', { origin: 'https://outro.test', host: 'site.test' }],
    [
      'Sec-Fetch-Site de outro site',
      { origin: 'https://site.test', host: 'site.test', 'sec-fetch-site': 'cross-site' },
    ],
  ])('%s: 403, sem conferir o papel nem tocar no banco', async (_name, headers) => {
    const response = await post(ID, headers);
    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('quem não é da administração é recusado antes de qualquer leitura', async () => {
    state.role = 'moderator';
    await expect(post()).rejects.toThrow('FORBIDDEN');
    expect(calls).toEqual(['requireRole:admin']);
  });

  it('id que não é uuid: 404, sem abrir o banco', async () => {
    const response = await post('nao-e-uuid');
    expect(response.status).toBe(404);
    expect(calls).toEqual(['requireRole:admin']);
  });

  it('pessoa inexistente: 404 e nada de auditoria', async () => {
    state.profile = null;
    const response = await post();
    expect(response.status).toBe(404);
    expect(calls.some((call) => call.startsWith('rpc:'))).toBe(false);
  });
});

describe('o arquivo', () => {
  it('é só da pessoa, versão 2, como anexo sem cache, com o nome sem dados dela', async () => {
    state.suspension = { user_id: ID };
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    const disposition = response.headers.get('content-disposition')!;
    expect(disposition).toMatch(/^attachment; filename="dados-aaaaaaaa-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(disposition).not.toMatch(/Fulana|Silva|@|exemplo/i);

    const body = JSON.parse(await response.text());
    expect(body.exportVersion).toBe(4);
    expect(body.profile.commentsSuspended).toBe(true);
    expect(body.account.email).toBe(EMAIL);
    // O aceite dos Termos vem da função do banco (a administração não lê a linha dos outros pelo RLS).
    expect(body.termsAcceptance).toEqual({
      version: '2026-10-06',
      acceptedAt: '2026-10-07T12:00:00Z',
      firstAcceptedAt: '2026-10-06T09:30:00Z',
    });
    expect(JSON.stringify(body)).not.toContain(OTHER_ID);
  });

  it('sem suspensão, commentsSuspended é falso', async () => {
    const body = JSON.parse(await (await post()).text());
    expect(body.profile.commentsSuspended).toBe(false);
  });

  it('tudo é lido filtrando pela pessoa (a administração lê os comentários de todo mundo pelo RLS)', async () => {
    await post();
    expect(calls).toContain(`eq:profiles.id=${ID}`);
    expect(calls).toContain(`eq:comments.author_id=${ID}`);
    expect(calls).toContain(`eq:member_suspensions.user_id=${ID}`);
  });

  it('admin_member_export roda por último: a auditoria só existe se o arquivo foi montado', async () => {
    await post();
    const reads = calls.filter((call) => call.startsWith('from:'));
    const exportAt = calls.findIndex((call) => call.startsWith('rpc:admin_member_export'));
    expect(reads).toEqual([
      'from:profiles',
      'from:comments',
      'from:member_suspensions',
      // Versão 4 (etapa 8k): a versão do tutorial vista, à parte.
      'from:profiles',
    ]);
    expect(exportAt).toBe(calls.length - 1);
    expect(calls[exportAt]).toBe(`rpc:admin_member_export:${JSON.stringify({ p_user_id: ID })}`);
  });

  it('a tabela de suspensões ausente não derruba o arquivo; outro erro nela sim', async () => {
    state.suspensionError = { code: '42P01', message: 'relation does not exist' };
    const missing = await post();
    expect(missing.status).toBe(200);
    expect(JSON.parse(await missing.text()).profile.commentsSuspended).toBe(false);

    state.suspensionError = { code: 'XX000', message: 'falha' };
    const broken = await post();
    expect(broken.status).toBe(303);
    expect(broken.headers.get('location')).toBe(`/painel/membros/${ID}?aviso=exportacao-falhou`);
    expect(broken.headers.get('content-disposition')).toBeNull();
  });
});

describe('sem arquivo', () => {
  it('contact_unavailable: volta ao perfil com o aviso, sem anexo nem corpo', async () => {
    state.rpcResult = { error: { code: 'P0001', message: 'contact_unavailable: x' } };
    const response = await post();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      `/painel/membros/${ID}?aviso=dados-indisponiveis`,
    );
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(await response.text()).toBe('');
    expect(logFailure).not.toHaveBeenCalled();
  });

  it('função ainda não aplicada: aviso de atualização pendente', async () => {
    state.rpcResult = { error: { code: 'PGRST202', message: 'x' } };
    const response = await post();
    expect(response.headers.get('location')).toBe(
      `/painel/membros/${ID}?aviso=atualizacao-pendente`,
    );
    expect(response.headers.get('content-disposition')).toBeNull();
  });

  it('conta devolvida que não é a pedida: nunca vira arquivo (e o log só leva o erro)', async () => {
    state.rpcResult = { data: payload(OTHER_ID) };
    const response = await post();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`/painel/membros/${ID}?aviso=exportacao-falhou`);
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(await response.text()).toBe('');
    expect(logFailure).toHaveBeenCalledTimes(1);
    const [label, logged] = logFailure.mock.calls[0]!;
    expect(label).toBe('members.export');
    expect(logged).toBeInstanceOf(Error);
    expect(JSON.stringify([label, (logged as Error).name])).not.toContain(EMAIL);
  });

  it('erro inesperado do banco: aviso genérico, log com o erro e nada de dado na resposta', async () => {
    const dbError = { code: 'XX000', message: `falha com ${EMAIL}` };
    state.rpcResult = { error: dbError };
    const response = await post();
    expect(response.headers.get('location')).toBe(`/painel/membros/${ID}?aviso=exportacao-falhou`);
    expect(logFailure).toHaveBeenCalledWith('members.export', dbError);
    expect(response.headers.get('location')).not.toContain('exemplo');
  });
});
