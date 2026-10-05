import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EXPORT_VERSION, buildAccountExport, exportFileName } from '@/lib/account/export';

/*
 * "Baixar meus dados": o arquivo só leva o que é da própria pessoa. Duas camadas: a função pura copia campo a
 * campo (um campo a mais que chegue por engano não entra) e o route handler filtra tudo pelo id de quem
 * está logado.
 */

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';

const { state, eqs, logFailure } = vi.hoisted(() => ({
  state: {
    user: null as unknown,
    authError: null as unknown,
    comments: [] as unknown[],
    failComments: false,
    suspended: false,
    suspensionError: null as { code: string } | null,
  },
  eqs: [] as string[],
  logFailure: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/log', () => ({ logFailure: (...a: unknown[]) => logFailure(...a) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const result = () => {
        if (table === 'comments') {
          return state.failComments
            ? { data: null, error: { code: '08006' } }
            : { data: state.comments, error: null };
        }
        if (table === 'member_suspensions') {
          return state.suspensionError
            ? { data: null, error: state.suspensionError }
            : { data: state.suspended ? { user_id: ME } : null, error: null };
        }
        if (table === 'profiles') {
          return {
            data: {
              display_name: 'Maria',
              avatar_url: null,
              role: 'member',
              approved_comment_count: 0,
              display_name_confirmed_at: null,
              created_at: 'a',
              updated_at: 'b',
            },
            error: null,
          };
        }
        return { data: [], error: null };
      };
      chain.select = () => chain;
      chain.eq = (column: string, value: string) => {
        eqs.push(`${table}.${column}=${value}`);
        return chain;
      };
      chain.order = () => chain;
      chain.range = async () => result();
      chain.maybeSingle = async () => result();
      chain.then = (resolve: (v: unknown) => void) => resolve(result());
      return chain;
    },
  }),
}));

const OTHER_EMAIL = 'outra.pessoa@exemplo.com';

describe('buildAccountExport', () => {
  const base = {
    generatedAt: new Date('2026-10-02T15:00:00.000Z'),
    account: {
      id: ME,
      email: 'eu@exemplo.com',
      createdAt: '2026-01-01T00:00:00Z',
      lastSignInAt: null,
      providers: ['email'],
    },
    profile: {
      display_name: 'Maria',
      avatar_url: null,
      role: 'member',
      approved_comment_count: 2,
      display_name_confirmed_at: '2026-01-02T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
    commentsSuspended: false,
    comments: [
      {
        id: 'c1',
        session_id: 's1',
        parent_id: null,
        body: 'Meu comentário',
        status: 'removed',
        read_up_to: 3,
        spoiler_up_to: 5,
        created_at: '2026-02-01T10:00:00.123456+00',
        updated_at: '2026-02-01T10:00:00.123456+00',
        reading_sessions: { number: 2, books: { slug: 'o-livro' } },
      },
    ],
    progress: [
      {
        chapter: 7,
        updated_at: '2026-03-01T00:00:00Z',
        books: { slug: 'o-livro', title: 'O Livro' },
      },
    ],
  };

  it('traz perfil, e-mail, comentários de QUALQUER status e progresso', () => {
    const out = buildAccountExport(base);
    expect(out.exportVersion).toBe(2);
    expect(EXPORT_VERSION).toBe(2);
    expect(out.profile?.commentsSuspended).toBe(false);
    expect(out.generatedAt).toBe('2026-10-02T15:00:00.000Z');
    expect(out.account.email).toBe('eu@exemplo.com');
    expect(out.profile?.displayName).toBe('Maria');
    expect(out.comments).toEqual([
      {
        id: 'c1',
        status: 'removed',
        body: 'Meu comentário',
        parentId: null,
        sessionId: 's1',
        sessionNumber: 2,
        bookSlug: 'o-livro',
        readUpTo: 3,
        spoilerUpTo: 5,
        createdAt: '2026-02-01T10:00:00.123456+00',
        updatedAt: '2026-02-01T10:00:00.123456+00',
      },
    ]);
    expect(out.readingProgress).toEqual([
      { bookSlug: 'o-livro', bookTitle: 'O Livro', chapter: 7, updatedAt: '2026-03-01T00:00:00Z' },
    ]);
  });

  it('copia campo a campo: dado de terceiros que chegue por engano NÃO entra no arquivo', () => {
    const leaky = structuredClone(base) as typeof base & Record<string, unknown>;
    (leaky.comments[0] as Record<string, unknown>).author = { email: OTHER_EMAIL };
    (leaky.comments[0] as Record<string, unknown>).replies = [
      { author_email: OTHER_EMAIL, body: 'resposta' },
    ];
    (leaky.account as Record<string, unknown>).refreshToken = 'token-secreto';
    (leaky.profile as Record<string, unknown>).email = OTHER_EMAIL;
    (leaky.progress[0] as Record<string, unknown>).user_id = 'outra-pessoa';
    leaky.extra = OTHER_EMAIL;
    const text = JSON.stringify(buildAccountExport(leaky));
    expect(text).not.toContain(OTHER_EMAIL);
    expect(text).not.toContain('token-secreto');
    expect(text).not.toContain('outra-pessoa');
    expect(text).not.toContain('resposta');
  });

  it('a situação da suspensão vai no perfil (versão 2)', () => {
    expect(
      buildAccountExport({ ...base, commentsSuspended: true }).profile?.commentsSuspended,
    ).toBe(true);
  });

  it('sem perfil, sem comentários e sem progresso continua válido', () => {
    const out = buildAccountExport({ ...base, profile: null, comments: [], progress: [] });
    expect(out.profile).toBeNull();
    expect(out.comments).toEqual([]);
    expect(out.readingProgress).toEqual([]);
  });

  it('nome do arquivo só com a data de Brasília', () => {
    expect(exportFileName(new Date('2026-10-02T23:59:00Z'))).toBe(
      'entre-capitulos-meus-dados-2026-10-02.json',
    );
    // 23h30 de Brasília de 4/10 já é 5/10 em UTC: o nome diz o dia que a pessoa viveu.
    expect(exportFileName(new Date('2026-10-05T02:30:00Z'))).toBe(
      'entre-capitulos-meus-dados-2026-10-04.json',
    );
    expect(exportFileName(new Date('2026-10-05T03:30:00Z'))).toBe(
      'entre-capitulos-meus-dados-2026-10-05.json',
    );
  });
});

describe('GET /conta/dados', () => {
  beforeEach(() => {
    state.user = {
      id: ME,
      email: 'eu@exemplo.com',
      is_anonymous: false,
      app_metadata: { providers: ['email', 'google'] },
    };
    state.authError = null;
    state.comments = [];
    state.failComments = false;
    state.suspended = false;
    state.suspensionError = null;
    eqs.length = 0;
    logFailure.mockClear();
  });

  it('visitante e login anônimo recebem 401, sem dado nenhum', async () => {
    const { GET } = await import('@/app/(public)/conta/dados/route');
    state.user = null;
    expect((await GET()).status).toBe(401);
    state.user = { id: ME, is_anonymous: true };
    expect((await GET()).status).toBe(401);
    expect(eqs).toEqual([]);
  });

  it('anexo, sem cache, e TODA consulta filtrada pelo id de quem está logado', async () => {
    const { GET } = await import('@/app/(public)/conta/dados/route');
    state.comments = [
      {
        id: 'c1',
        session_id: 's1',
        parent_id: null,
        body: 'oi',
        status: 'pending',
        read_up_to: 0,
        spoiler_up_to: null,
        created_at: 'x',
        updated_at: 'y',
        reading_sessions: null,
      },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="entre-capitulos-meus-dados-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(eqs.sort()).toEqual([
      `comments.author_id=${ME}`,
      `member_suspensions.user_id=${ME}`,
      `profiles.id=${ME}`,
      `reading_progress.user_id=${ME}`,
    ]);
    const body = await res.json();
    expect(body.account.email).toBe('eu@exemplo.com');
    expect(body.account.providers).toEqual(['email', 'google']);
    expect(body.comments).toHaveLength(1);
  });

  it('versão 2: a situação da suspensão da PRÓPRIA pessoa vai no perfil', async () => {
    const { GET } = await import('@/app/(public)/conta/dados/route');
    expect((await (await GET()).json()).profile.commentsSuspended).toBe(false);
    state.suspended = true;
    const body = await (await GET()).json();
    expect(body.exportVersion).toBe(2);
    expect(body.profile.commentsSuspended).toBe(true);
  });

  it('sem a tabela (migration não aplicada) não há suspensão; qualquer outro erro derruba o arquivo', async () => {
    const { GET } = await import('@/app/(public)/conta/dados/route');
    state.suspensionError = { code: 'PGRST205' };
    const missing = await GET();
    expect(missing.status).toBe(200);
    expect((await missing.json()).profile.commentsSuspended).toBe(false);

    state.suspensionError = { code: '08006' };
    expect((await GET()).status).toBe(500);
  });

  it('falha do banco: 500 em pt-BR, log sem dados e nada no corpo', async () => {
    const { GET } = await import('@/app/(public)/conta/dados/route');
    state.failComments = true;
    const res = await GET();
    expect(res.status).toBe(500);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      erro: 'Não foi possível gerar o arquivo agora. Tente de novo em instantes.',
    });
    expect(logFailure).toHaveBeenCalledWith('account.export', expect.anything());
  });
});
