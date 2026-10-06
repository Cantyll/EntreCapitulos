import { beforeEach, describe, expect, it, vi } from 'vitest';

const logFailure = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/log', () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));

const { defaultAbout } = await import('./defaults');
const {
  isAboutPublished,
  loadAboutEditorState,
  parseToken,
  publishAbout,
  readServerDraft,
  restoreAboutRevision,
  saveAboutDraft,
} = await import('./service');
const { ABOUT_MESSAGES } = await import('./errors');

/*
 * O serviço da página Sobre com o Supabase trocado por um dublê: o cliente só manda conteúdo e token; o conteúdo é
 * validado ANTES de ir ao banco; o conflito devolve a versão do servidor; publicar salva e publica; erros esperados não
 * são registrados; os registros só levam o erro (nunca o texto editado).
 */

type RpcCall = { name: string; args: Record<string, unknown> };
type World = {
  rpc: Record<string, { data: unknown; error: unknown } | undefined>;
  rpcCalls: RpcCall[];
  tables: Record<string, { data?: unknown; error?: unknown; count?: number | null }>;
  throws: boolean;
};
let world: World;

const client = () =>
  ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      world.rpcCalls.push({ name, args });
      if (world.throws) throw new Error('rede caiu com o texto "SEGREDO-EDITADO"');
      return world.rpc[name] ?? { data: null, error: { code: 'XX000', message: 'sem dublê' } };
    },
    from: (table: string) => {
      const result = () => world.tables[table] ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order', 'limit', 'in']) chain[method] = () => chain;
      chain.maybeSingle = async () => result();
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve);
      return chain;
    },
  }) as never;

beforeEach(() => {
  world = { rpc: {}, rpcCalls: [], tables: {}, throws: false };
  logFailure.mockClear();
});

const TOKEN_1 = '2026-10-06T15:00:00.123456+00:00';
const TOKEN_2 = '2026-10-06T15:05:00.654321+00:00';
const content = (title = 'Meu título') => ({ ...defaultAbout(), title });

describe('parseToken', () => {
  it('aceita null (primeiro salvamento) e um texto de até 64 caracteres, sem converter para Date', () => {
    expect(parseToken(null)).toEqual({ ok: true, token: null });
    expect(parseToken(TOKEN_1)).toEqual({ ok: true, token: TOKEN_1 });
  });

  it.each([undefined, 42, {}, [], '', 'a'.repeat(65), true])('recusa %j', (value) => {
    expect(parseToken(value)).toEqual({ ok: false });
  });
});

describe('saveAboutDraft', () => {
  it('conteúdo inválido NÃO chega ao banco (zod antes) e traz os campos com problema', async () => {
    const result = await saveAboutDraft(client(), {
      content: { ...defaultAbout(), links: [{ label: 'x', url: 'http://exemplo.com' }] },
      expectedUpdatedAt: null,
    });
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.fields.map((f) => f.path)).toEqual(['links.0.url']);
      expect(result.message).toBe(ABOUT_MESSAGES.invalid);
    }
    expect(world.rpcCalls).toEqual([]);
  });

  it('conteúdo grande demais: recusado antes do banco', async () => {
    const big = { ...defaultAbout(), bio: 'a'.repeat(200 * 1024) };
    const result = await saveAboutDraft(client(), { content: big, expectedUpdatedAt: null });
    expect(result).toMatchObject({ kind: 'invalid', issue: 'too_large' });
    expect(world.rpcCalls).toEqual([]);
  });

  it('o primeiro salvamento não manda token; salva e devolve o token novo (texto opaco) e o conteúdo canônico', async () => {
    world.rpc.save_site_page_draft = { data: TOKEN_1, error: null };
    const result = await saveAboutDraft(client(), {
      content: content('  Meu\ntítulo  '),
      expectedUpdatedAt: null,
    });
    expect(result).toMatchObject({ kind: 'saved', updatedAt: TOKEN_1 });
    if (result.kind === 'saved') expect(result.content.title).toBe('Meu título');
    expect(world.rpcCalls).toHaveLength(1);
    expect(world.rpcCalls[0]!.args).toEqual({
      p_slug: 'sobre',
      p_content: expect.objectContaining({ v: 1, title: 'Meu título' }),
    });
    expect(world.rpcCalls[0]!.args).not.toHaveProperty('p_expected_updated_at');
  });

  it('um salvamento seguinte manda o token como TEXTO, igualzinho ao que recebeu', async () => {
    world.rpc.save_site_page_draft = { data: TOKEN_2, error: null };
    await saveAboutDraft(client(), { content: content(), expectedUpdatedAt: TOKEN_1 });
    expect(world.rpcCalls[0]!.args.p_expected_updated_at).toBe(TOKEN_1);
    expect(typeof world.rpcCalls[0]!.args.p_expected_updated_at).toBe('string');
  });

  it('conflito: devolve a versão do servidor (conteúdo e token) para o banner, sem registrar nada', async () => {
    world.rpc.save_site_page_draft = {
      data: null,
      error: {
        code: 'P0001',
        message: 'site_page_conflict: the draft was changed by someone else',
      },
    };
    world.tables.site_page_drafts = {
      data: { content: content('Versão do servidor'), updated_at: TOKEN_2 },
      error: null,
    };
    const result = await saveAboutDraft(client(), {
      content: content(),
      expectedUpdatedAt: TOKEN_1,
    });
    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') {
      expect(result.server?.updatedAt).toBe(TOKEN_2);
      expect(result.server?.content.title).toBe('Versão do servidor');
    }
    expect(logFailure).not.toHaveBeenCalled();
  });

  it('conflito sem rascunho legível no servidor: conflict com server nulo (a tela pede para recarregar)', async () => {
    world.rpc.save_site_page_draft = {
      data: null,
      error: { code: 'P0001', message: 'site_page_conflict: x' },
    };
    const result = await saveAboutDraft(client(), {
      content: content(),
      expectedUpdatedAt: TOKEN_1,
    });
    expect(result).toEqual({ kind: 'conflict', server: null });
  });

  it.each([
    [
      '42501',
      'not_admin: only the administration can edit the site pages',
      ABOUT_MESSAGES.not_admin,
    ],
    ['54000', 'site_page_too_large: the page content is over 128 KB', ABOUT_MESSAGES.too_large],
    ['22023', 'site_page_invalid: bad_links', ABOUT_MESSAGES.invalid],
    ['40P01', 'deadlock detected', ABOUT_MESSAGES.busy],
    ['PGRST202', 'Could not find the function', ABOUT_MESSAGES.migration_pending],
  ])(
    'erro esperado (%s): texto fixo em pt-BR e NENHUM registro',
    async (code, message, expected) => {
      world.rpc.save_site_page_draft = { data: null, error: { code, message } };
      const result = await saveAboutDraft(client(), {
        content: content(),
        expectedUpdatedAt: null,
      });
      expect(result).toMatchObject({ kind: 'error', message: expected });
      expect(logFailure).not.toHaveBeenCalled();
    },
  );

  it('migration pendente é sinalizada para a tela', async () => {
    world.rpc.save_site_page_draft = { data: null, error: { code: 'PGRST202', message: 'x' } };
    expect(
      await saveAboutDraft(client(), { content: content(), expectedUpdatedAt: null }),
    ).toMatchObject({
      kind: 'error',
      pending: true,
    });
  });

  it('erro inesperado: mensagem genérica na tela, e o log leva só o erro (nunca o texto editado)', async () => {
    const error = { code: 'XX000', message: 'falhou com SEGREDO-EDITADO' };
    world.rpc.save_site_page_draft = { data: null, error };
    const result = await saveAboutDraft(client(), {
      content: content('SEGREDO-EDITADO'),
      expectedUpdatedAt: null,
    });
    expect(result).toMatchObject({
      kind: 'error',
      message: ABOUT_MESSAGES.generic,
      pending: false,
    });
    expect(logFailure).toHaveBeenCalledTimes(1);
    expect(logFailure).toHaveBeenCalledWith('about.salvar', error);
    expect(JSON.stringify(result)).not.toContain('SEGREDO');
  });

  it('exceção de rede: mensagem genérica, nada do texto na resposta', async () => {
    world.throws = true;
    const result = await saveAboutDraft(client(), {
      content: content('SEGREDO-EDITADO'),
      expectedUpdatedAt: null,
    });
    expect(result).toEqual({ kind: 'error', message: ABOUT_MESSAGES.generic });
    expect(logFailure).toHaveBeenCalledWith('about.salvar', expect.any(Error));
    expect(JSON.stringify(result)).not.toContain('SEGREDO');
  });
});

describe('publishAbout', () => {
  it('salva o conteúdo e publica o rascunho com o token que o salvamento devolveu', async () => {
    world.rpc.save_site_page_draft = { data: TOKEN_1, error: null };
    world.rpc.publish_site_page = { data: TOKEN_2, error: null };
    const result = await publishAbout(client(), {
      content: content('Publicado'),
      expectedUpdatedAt: null,
    });
    expect(result).toMatchObject({ kind: 'published', updatedAt: TOKEN_2 });
    expect(world.rpcCalls.map((c) => c.name)).toEqual([
      'save_site_page_draft',
      'publish_site_page',
    ]);
    expect(world.rpcCalls[1]!.args).toEqual({ p_slug: 'sobre', p_expected_updated_at: TOKEN_1 });
  });

  it('regras da publicação: abertura vazia não publica (e nada vai ao banco); o rascunho aceitaria', async () => {
    const empty = { ...defaultAbout(), intro: { type: 'doc' as const, content: [] } };
    expect(await publishAbout(client(), { content: empty, expectedUpdatedAt: null })).toMatchObject(
      {
        kind: 'invalid',
        fields: [{ path: 'intro' }],
      },
    );
    expect(world.rpcCalls).toEqual([]);
    world.rpc.save_site_page_draft = { data: TOKEN_1, error: null };
    expect(
      await saveAboutDraft(client(), { content: empty, expectedUpdatedAt: null }),
    ).toMatchObject({ kind: 'saved' });
  });

  it('conflito no salvamento: devolve a versão do servidor e NÃO tenta publicar', async () => {
    world.rpc.save_site_page_draft = {
      data: null,
      error: { code: 'P0001', message: 'site_page_conflict: x' },
    };
    world.tables.site_page_drafts = {
      data: { content: content('Do servidor'), updated_at: TOKEN_2 },
      error: null,
    };
    const result = await publishAbout(client(), { content: content(), expectedUpdatedAt: TOKEN_1 });
    expect(result.kind).toBe('conflict');
    expect(world.rpcCalls.map((c) => c.name)).toEqual(['save_site_page_draft']);
  });

  it('conflito na publicação (alguém salvou no meio): devolve a versão do servidor', async () => {
    world.rpc.save_site_page_draft = { data: TOKEN_1, error: null };
    world.rpc.publish_site_page = {
      data: null,
      error: { code: 'P0001', message: 'site_page_conflict: x' },
    };
    world.tables.site_page_drafts = {
      data: { content: content('Do servidor'), updated_at: TOKEN_2 },
      error: null,
    };
    expect(
      (await publishAbout(client(), { content: content(), expectedUpdatedAt: null })).kind,
    ).toBe('conflict');
  });

  it('publicar falhou depois de salvar: o rascunho FOI salvo e a resposta traz o token novo', async () => {
    world.rpc.save_site_page_draft = { data: TOKEN_1, error: null };
    world.rpc.publish_site_page = { data: null, error: { code: 'XX000', message: 'boom' } };
    const result = await publishAbout(client(), { content: content(), expectedUpdatedAt: null });
    expect(result).toEqual({
      kind: 'error',
      message: ABOUT_MESSAGES.generic,
      pending: false,
      savedUpdatedAt: TOKEN_1,
    });
    expect(logFailure).toHaveBeenCalledWith('about.publicar', expect.anything());
  });

  it('exceção de rede entre as duas chamadas também traz o token do rascunho salvo', async () => {
    let calls = 0;
    const throwing = {
      rpc: async () => {
        calls += 1;
        if (calls === 1) return { data: TOKEN_1, error: null };
        throw new Error('rede');
      },
      from: () => ({}),
    } as never;
    const result = await publishAbout(throwing, { content: content(), expectedUpdatedAt: null });
    expect(result).toMatchObject({ kind: 'error', savedUpdatedAt: TOKEN_1 });
  });
});

describe('restoreAboutRevision', () => {
  it('restaura a versão e devolve o rascunho do servidor (que agora É o conteúdo restaurado)', async () => {
    world.rpc.restore_site_page_revision = { data: TOKEN_2, error: null };
    world.tables.site_page_drafts = {
      data: { content: content('Versão restaurada'), updated_at: TOKEN_2 },
      error: null,
    };
    const result = await restoreAboutRevision(client(), {
      revisionId: 7,
      expectedUpdatedAt: TOKEN_1,
    });
    expect(result).toMatchObject({ kind: 'restored', updatedAt: TOKEN_2 });
    if (result.kind === 'restored') expect(result.content.title).toBe('Versão restaurada');
    expect(world.rpcCalls[0]).toEqual({
      name: 'restore_site_page_revision',
      args: { p_slug: 'sobre', p_revision_id: 7, p_expected_updated_at: TOKEN_1 },
    });
  });

  it.each([0, -1, 1.5, Number.NaN, '7', null, undefined, 2 ** 60])(
    'id de versão inválido (%j): recusado SEM ir ao banco',
    async (id) => {
      const result = await restoreAboutRevision(client(), {
        revisionId: id,
        expectedUpdatedAt: null,
      });
      expect(result.kind).toBe('error');
      expect(world.rpcCalls).toEqual([]);
    },
  );

  it('conflito (o rascunho mudou): devolve a versão do servidor para a tela decidir', async () => {
    world.rpc.restore_site_page_revision = {
      data: null,
      error: { code: 'P0001', message: 'site_page_conflict: x' },
    };
    world.tables.site_page_drafts = {
      data: { content: content('Do servidor'), updated_at: TOKEN_2 },
      error: null,
    };
    expect(
      (await restoreAboutRevision(client(), { revisionId: 3, expectedUpdatedAt: TOKEN_1 })).kind,
    ).toBe('conflict');
  });

  it('versão que não existe mais: texto fixo, sem registro', async () => {
    world.rpc.restore_site_page_revision = {
      data: null,
      error: { code: 'P0002', message: 'revision_not_found: no such version' },
    };
    const result = await restoreAboutRevision(client(), { revisionId: 3, expectedUpdatedAt: null });
    expect(result).toMatchObject({ kind: 'error', message: ABOUT_MESSAGES.revision_not_found });
    expect(logFailure).not.toHaveBeenCalled();
  });
});

describe('readServerDraft', () => {
  it('rascunho que não passa na validação vale como "sem versão do servidor" (nunca mostra lixo)', async () => {
    world.tables.site_page_drafts = {
      data: { content: { v: 9 }, updated_at: TOKEN_1 },
      error: null,
    };
    expect(await readServerDraft(client())).toBeNull();
  });
});

describe('loadAboutEditorState', () => {
  const draftRow = (title: string) => ({ content: content(title), updated_at: TOKEN_1 });
  const publishedRow = (title: string) => ({ content: content(title), published_at: TOKEN_2 });

  it('tabelas ausentes (migration pendente): available false, em silêncio', async () => {
    world.tables.site_page_drafts = { data: null, error: { code: 'PGRST205' } };
    expect(await loadAboutEditorState(client())).toEqual({ available: false });
    expect(logFailure).not.toHaveBeenCalled();
  });

  it('outra falha de leitura: available false e só o erro é registrado', async () => {
    world.tables.site_pages = { data: null, error: { code: 'XX000', message: 'segredo' } };
    expect(await loadAboutEditorState(client())).toEqual({ available: false });
    expect(logFailure).toHaveBeenCalledWith('about.editor.leitura', expect.anything());
  });

  it('nada salvo nem publicado: começa do texto padrão de código, sem rascunho', async () => {
    const state = await loadAboutEditorState(client());
    expect(state).toMatchObject({
      available: true,
      source: 'default',
      draftUpdatedAt: null,
      hasUnpublishedChanges: false,
      publishedAt: null,
      contentUnreadable: false,
      history: [],
    });
    if (state.available) expect(state.content).toEqual(defaultAbout());
  });

  it('só publicado (sem rascunho): começa do publicado', async () => {
    world.tables.site_pages = { data: publishedRow('Publicado'), error: null };
    const state = await loadAboutEditorState(client());
    expect(state).toMatchObject({
      available: true,
      source: 'published',
      draftUpdatedAt: null,
      publishedAt: TOKEN_2,
    });
    if (state.available) expect(state.content.title).toBe('Publicado');
  });

  it('rascunho igual ao publicado: sem alterações pendentes; diferente: com alterações', async () => {
    world.tables.site_pages = { data: publishedRow('Igual'), error: null };
    world.tables.site_page_drafts = { data: draftRow('Igual'), error: null };
    expect(await loadAboutEditorState(client())).toMatchObject({
      source: 'draft',
      hasUnpublishedChanges: false,
      draftUpdatedAt: TOKEN_1,
    });
    world.tables.site_page_drafts = { data: draftRow('Diferente'), error: null };
    expect(await loadAboutEditorState(client())).toMatchObject({
      source: 'draft',
      hasUnpublishedChanges: true,
    });
  });

  it('rascunho e nada publicado: há alterações a publicar', async () => {
    world.tables.site_page_drafts = { data: draftRow('Só rascunho'), error: null };
    expect(await loadAboutEditorState(client())).toMatchObject({
      hasUnpublishedChanges: true,
      publishedAt: null,
    });
  });

  it('o rascunho ilegível é trocado pelo padrão e avisado (não derruba a tela)', async () => {
    world.tables.site_page_drafts = {
      data: { content: { v: 9 }, updated_at: TOKEN_1 },
      error: null,
    };
    const state = await loadAboutEditorState(client());
    expect(state).toMatchObject({ available: true, source: 'default', contentUnreadable: true });
  });

  it('o histórico traz id, tipo, data, o título da versão e o nome (público) de quem publicou', async () => {
    world.tables.site_page_revisions = {
      data: [
        { id: 12, kind: 'restore', published_at: TOKEN_2, published_by: 'u1', title: 'Versão 12' },
        { id: 11, kind: 'publish', published_at: TOKEN_1, published_by: null, title: null },
      ],
      error: null,
    };
    world.tables.profiles = { data: [{ id: 'u1', display_name: 'Agatha' }], error: null };
    const state = await loadAboutEditorState(client());
    expect(state.available && state.history).toEqual([
      { id: 12, kind: 'restore', publishedAt: TOKEN_2, byName: 'Agatha', title: 'Versão 12' },
      { id: 11, kind: 'publish', publishedAt: TOKEN_1, byName: null, title: '' },
    ]);
  });
});

describe('isAboutPublished (o aviso do texto provisório)', () => {
  it('sem nenhuma publicação: false (mostra o aviso); com publicação: true', async () => {
    world.tables.site_pages = { count: 0, error: null };
    expect(await isAboutPublished(client())).toBe(false);
    world.tables.site_pages = { count: 1, error: null };
    expect(await isAboutPublished(client())).toBe(true);
  });

  it('se a leitura falhar (ou a tabela não existir), null: não mostra nada e nunca quebra', async () => {
    world.tables.site_pages = { count: null, error: { code: 'PGRST205' } };
    expect(await isAboutPublished(client())).toBeNull();
    expect(logFailure).not.toHaveBeenCalled();
    world.tables.site_pages = { count: null, error: { code: 'XX000', message: 'x' } };
    expect(await isAboutPublished(client())).toBeNull();
    expect(logFailure).toHaveBeenCalledWith('about.publicada', expect.anything());
  });
});
