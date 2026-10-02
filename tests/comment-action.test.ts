import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * `createComment` e `loadMoreComments` com o Supabase trocado por um dublê. O que importa aqui:
 * o cliente só escolhe sessão, pai, texto e capítulo do spoiler; status, autor, `read_up_to`, id e data nunca
 * vêm dele; os erros do banco viram mensagens em pt-BR; e o log de falha nunca leva o texto do comentário.
 */

const SESSION = '4f1c2a9e-1b2c-4d3e-8f4a-5b6c7d8e9f00';
const PARENT = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const CURSOR_ID = '11111111-2222-4333-8444-555555555555';

const calls: string[] = [];
const inserted: Record<string, unknown>[] = [];
const state = {
  user: { id: 'user-1', nameConfirmed: true } as { id: string; nameConfirmed: boolean },
  session: {
    id: SESSION,
    chapter_to: 12,
    book_id: 'b1',
    books: { id: 'b1', slug: 'o-livro', total_chapters: 52 },
  } as unknown,
  sessionError: null as unknown,
  insertResult: { data: { status: 'pending' }, error: null } as {
    data: { status: string } | null;
    error: unknown;
  },
  progress: 7 as number | null,
  publicSessionIds: [SESSION] as string[],
  viewer: { id: 'user-1' } as { id: string } | null,
};

const redirectSentinel = new Error('NEXT_REDIRECT');
vi.mock('@/lib/auth/session', () => ({
  requireUser: async () => {
    if (!state.user) throw redirectSentinel;
    return state.user;
  },
}));
vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => void calls.push(`revalidate:${a.join(',')}`),
}));
vi.mock('@/lib/public/tags', () => ({
  invalidateComments: (id: string) => void calls.push(`invalidate:${id}`),
}));
vi.mock('@/lib/public/person', () => ({
  getProgressFor: async () => state.progress,
  getViewer: async () => state.viewer,
}));
vi.mock('@/lib/public/queries', () => ({
  getPublicSessions: async () => state.publicSessionIds.map((id) => ({ id })),
}));
const loadDiscussionPage = vi.fn();
vi.mock('@/lib/comments/queries', () => ({
  loadDiscussionPage: (...a: unknown[]) => loadDiscussionPage(...a),
}));
const logFailure = vi.fn();
vi.mock('@/lib/auth/log', () => ({ logFailure: (...a: unknown[]) => logFailure(...a) }));

const rpcCalls: [string, unknown][] = [];
const rpcState = { result: { data: SESSION, error: null } as { data: unknown; error: unknown } };

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push([name, args]);
      return rpcState.result;
    },
    from: (table: string) => {
      if (table === 'reading_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.session, error: state.sessionError }),
            }),
          }),
        };
      }
      return {
        insert: (values: Record<string, unknown>) => {
          calls.push('comments.insert');
          inserted.push(values);
          return { select: () => ({ single: async () => state.insertResult }) };
        },
      };
    },
  }),
}));

const { createComment, loadMoreComments, retractComment } =
  await import('@/app/(public)/comment-actions');
const IDLE = { status: 'idle', message: '' } as const;

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const send = (fields: Record<string, string>) =>
  createComment(IDLE, form({ sessionId: SESSION, body: 'Texto do comentário', ...fields }));

beforeEach(() => {
  calls.length = 0;
  inserted.length = 0;
  state.user = { id: 'user-1', nameConfirmed: true };
  state.session = {
    id: SESSION,
    chapter_to: 12,
    book_id: 'b1',
    books: { id: 'b1', slug: 'o-livro', total_chapters: 52 },
  };
  state.sessionError = null;
  state.insertResult = { data: { status: 'pending' }, error: null };
  state.progress = 7;
  state.publicSessionIds = [SESSION];
  state.viewer = { id: 'user-1' };
  logFailure.mockClear();
  loadDiscussionPage.mockReset();
  rpcCalls.length = 0;
  rpcState.result = { data: SESSION, error: null };
});

describe('createComment: quem pode', () => {
  it('sem sessão (ou login anônimo) o requireUser redireciona e a exceção passa', async () => {
    state.user = null as never;
    await expect(send({})).rejects.toBe(redirectSentinel);
    expect(calls).toEqual([]);
  });

  it('nome ainda não confirmado: profile_incomplete, sem tocar no banco', async () => {
    state.user = { id: 'user-1', nameConfirmed: false };
    const out = await send({});
    expect(out).toMatchObject({ status: 'error', code: 'profile_incomplete' });
    expect(calls).toEqual([]);
  });
});

describe('createComment: validação', () => {
  it.each([
    [{ sessionId: 'x' }, 'not_found'],
    [{ sessionId: `${SESSION}'; drop` }, 'not_found'],
    [{ parentId: 'não-é-uuid' }, 'not_found'],
    [{ body: '   ​  ' }, 'empty'],
    [{ body: 'a'.repeat(2001) }, 'too_long'],
  ] as const)('%j → %s, sem consulta', async (fields, code) => {
    const out = await send({ ...fields });
    expect(out).toMatchObject({ status: 'error', code });
    expect(calls).toEqual([]);
  });

  it('sessão que a pessoa não enxerga (RLS) ou que não existe', async () => {
    state.session = null;
    expect(await send({})).toMatchObject({ status: 'error', code: 'not_found' });
    expect(calls).toEqual([]);
  });

  it.each(['12', '11', '53', '1.5', '-1', 'abc', '13abc'])(
    'spoiler inválido %j',
    async (spoilerUpTo) => {
      expect(await send({ spoilerUpTo })).toMatchObject({
        status: 'error',
        code: 'invalid_spoiler',
      });
      expect(calls).toEqual([]);
    },
  );

  it.each([
    ['', null],
    ['0', null],
    ['13', 13],
    ['52', 52],
  ])('spoiler %j grava %j', async (spoilerUpTo, expected) => {
    expect((await send({ spoilerUpTo })).status).toBe('ok');
    expect(inserted[0]!.spoiler_up_to).toBe(expected);
  });
});

describe('createComment: o que vai para o banco', () => {
  it('lista fixa de campos, nunca status, e tudo que importa vem do servidor', async () => {
    const out = await send({
      parentId: PARENT,
      body: '  Olá\r\n\r\n\r\n\r\nmundo​  ',
      // Tentativas de o cliente decidir o que é do servidor: ignoradas.
      status: 'approved',
      authorId: 'outra-pessoa',
      readUpTo: '999',
      read_up_to: '999',
      author_id: 'outra-pessoa',
      id: 'x',
      createdAt: '2020-01-01',
    });
    expect(out.status).toBe('ok');
    const row = inserted[0]!;
    expect(Object.keys(row).sort()).toEqual(
      ['author_id', 'body', 'id', 'parent_id', 'read_up_to', 'session_id', 'spoiler_up_to'].sort(),
    );
    expect(row).not.toHaveProperty('status');
    expect(row.author_id).toBe('user-1');
    expect(row.session_id).toBe(SESSION);
    expect(row.parent_id).toBe(PARENT);
    expect(row.body).toBe('Olá\n\nmundo');
    expect(row.read_up_to).toBe(7);
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('progresso desconhecido grava read_up_to 0', async () => {
    state.progress = null;
    await send({});
    expect(inserted[0]!.read_up_to).toBe(0);
  });

  it('sem pai grava parent_id nulo', async () => {
    await send({});
    expect(inserted[0]!.parent_id).toBeNull();
  });

  it('um corpo com <script> segue como texto, sem mudar', async () => {
    const body = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    await send({ body });
    expect(inserted[0]!.body).toBe(body);
  });
});

describe('createComment: resultado', () => {
  it('aprovado: mensagem de publicado, e a lista pública expira', async () => {
    state.insertResult = { data: { status: 'approved' }, error: null };
    expect(await send({})).toEqual({
      status: 'ok',
      outcome: 'approved',
      message: 'Comentário publicado.',
    });
    expect(calls).toContain(`invalidate:${SESSION}`);
    expect(calls).toContain('revalidate:/,layout');
  });

  it('pendente: mensagem de moderação', async () => {
    expect(await send({})).toEqual({
      status: 'ok',
      outcome: 'pending',
      message: 'Recebemos seu comentário. Ele aparece depois que a moderação aprovar.',
    });
  });

  it.each([
    ['profile_incomplete: choose the name', 'profile_incomplete'],
    ['session_not_published: only', 'session_not_published'],
    ['comments_closed: not accepting', 'comments_closed'],
    ['invalid_parent: replies go', 'invalid_parent'],
    ['rate_limited: too many comments in a short time', 'rate_limited'],
  ])(
    'erro do banco "%s" vira mensagem em pt-BR, sem log e sem invalidar',
    async (message, code) => {
      state.insertResult = { data: null, error: { code: '23514', message } };
      const out = await send({});
      expect(out).toMatchObject({ status: 'error', code });
      expect(out.message).not.toMatch(/[a-z_]+:\s/);
      expect(logFailure).not.toHaveBeenCalled();
      expect(calls.some((c) => c.startsWith('invalidate'))).toBe(false);
    },
  );

  it('limite de frequência: a mensagem pedida, sem log', async () => {
    state.insertResult = {
      data: null,
      error: { code: 'P0001', message: 'rate_limited: too many comments in a short time' },
    };
    const out = await send({});
    expect(out.message).toBe(
      'Você está comentando rápido demais. Espere um pouco e tente de novo.',
    );
  });

  it('erro inesperado: mensagem genérica e log SEM o texto do comentário', async () => {
    const secret = 'segredo-que-nao-pode-vazar';
    const error = Object.assign(new Error(`falha com ${secret}`), { code: '08006' });
    state.insertResult = { data: null, error };
    const out = await send({ body: secret });
    expect(out).toMatchObject({ status: 'error', code: 'generic' });
    expect(out.message).toContain('Seu texto continua aqui');
    expect(logFailure).toHaveBeenCalledTimes(1);
    expect(logFailure.mock.calls[0]![0]).toBe('comments.create');
    expect(JSON.stringify(logFailure.mock.calls)).not.toContain(secret);
  });

  it('exceção de rede: genérica, com log só do erro', async () => {
    state.sessionError = Object.assign(new Error('rede'), { code: 'ECONNRESET' });
    const out = await send({});
    expect(out).toMatchObject({ status: 'error', code: 'generic' });
    expect(logFailure).toHaveBeenCalledTimes(1);
  });
});

describe('loadMoreComments', () => {
  const cursor = { createdAt: '2026-09-29T15:00:00.123456+00:00', id: CURSOR_ID };
  const page = { items: [], nextCursor: null, total: 0 };

  it('recusa cursor, sessão ou ordem malformados sem consultar nada', async () => {
    for (const bad of [
      null,
      {},
      { createdAt: 'x', id: CURSOR_ID },
      { createdAt: cursor.createdAt, id: 'x' },
    ]) {
      expect((await loadMoreComments(SESSION, 'recentes', bad)).ok).toBe(false);
    }
    expect((await loadMoreComments('x', 'recentes', cursor)).ok).toBe(false);
    expect(loadDiscussionPage).not.toHaveBeenCalled();
  });

  it('sessão pública: do cache compartilhado; ordem desconhecida vira "recentes"', async () => {
    loadDiscussionPage.mockResolvedValue(page);
    const out = await loadMoreComments(SESSION, 'qualquer-coisa', cursor);
    expect(out.ok).toBe(true);
    expect(loadDiscussionPage).toHaveBeenCalledWith({
      sessionId: SESSION,
      membersOnly: false,
      viewerId: 'user-1',
      order: 'recentes',
      cursor,
    });
  });

  it('sessão que não está na lista pública é lida como "só para membros" (o RLS decide)', async () => {
    state.publicSessionIds = [];
    loadDiscussionPage.mockResolvedValue(page);
    await loadMoreComments(SESSION, 'antigos', cursor);
    expect(loadDiscussionPage.mock.calls[0]![0]).toMatchObject({
      membersOnly: true,
      order: 'antigos',
    });
  });

  it('visitante: sem id de quem vê', async () => {
    state.viewer = null;
    loadDiscussionPage.mockResolvedValue(page);
    await loadMoreComments(SESSION, 'recentes', cursor);
    expect(loadDiscussionPage.mock.calls[0]![0]).toMatchObject({ viewerId: null });
  });

  it('falha no banco: mensagem em pt-BR e log sem dados', async () => {
    loadDiscussionPage.mockRejectedValue(Object.assign(new Error('x'), { code: '08006' }));
    const out = await loadMoreComments(SESSION, 'recentes', cursor);
    expect(out.ok).toBe(false);
    expect(logFailure).toHaveBeenCalledWith('comments.more', expect.anything());
  });
});

describe('retractComment (excluir o próprio comentário)', () => {
  const ID = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';

  it('sem sessão o requireUser redireciona e nada chega ao banco', async () => {
    state.user = null as never;
    await expect(retractComment(ID)).rejects.toBe(redirectSentinel);
    expect(rpcCalls).toEqual([]);
  });

  it('só manda o id do comentário à função do banco e expira o cache da sessão devolvida', async () => {
    expect(await retractComment(ID)).toEqual({ ok: true });
    expect(rpcCalls).toEqual([['retract_comment', { p_comment_id: ID }]]);
    expect(calls).toContain(`invalidate:${SESSION}`);
    expect(calls).toContain('revalidate:/,layout');
  });

  it.each(['x', `${ID}'; drop`, ''])('id malformado %j: recusa sem consultar', async (id) => {
    const out = await retractComment(id);
    expect(out.ok).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it.each([
    [{ code: 'P0002', message: 'comment_not_found: x' }, 'Não encontramos este comentário', false],
    [{ code: '42501', message: 'not_signed_in: x' }, 'Entre de novo', false],
    [{ code: 'PGRST202', message: 'no function' }, 'ainda não está disponível', false],
    [{ code: '08006', message: 'connection' }, 'Não foi possível excluir agora', true],
  ])('erro %j vira mensagem em pt-BR', async (error, text, logged) => {
    rpcState.result = { data: null, error };
    const out = await retractComment(ID);
    expect(out).toMatchObject({ ok: false });
    expect(out.ok === false && out.message).toContain(text);
    expect(logFailure).toHaveBeenCalledTimes(logged ? 1 : 0);
    expect(calls.some((c) => c.startsWith('invalidate'))).toBe(false);
  });
});
