import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Server Actions da página Sobre com o serviço trocado por um dublê: `requireRole('admin')` vem ANTES de tudo (a
 * moderação e o membro recebem 403 sem tocar em nada); o token precisa ser texto; só publicar e restaurar expiram o
 * cache público (a tag `site:sobre` e a rota `/sobre`); salvar o rascunho e finalizar a foto nunca expiram.
 */

const calls: string[] = [];
const state = {
  forbidden: false,
  save: { kind: 'saved', updatedAt: 't1', content: {} } as Record<string, unknown>,
  publish: { kind: 'published', updatedAt: 't2', content: {} } as Record<string, unknown>,
  restore: { kind: 'restored', updatedAt: 't3', content: {} } as Record<string, unknown>,
  photo: { ok: true, path: 'site/sobre/x.webp' } as Record<string, unknown>,
};

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => void calls.push(`revalidatePath:${args.join(',')}`),
  updateTag: (tag: string) => void calls.push(`updateTag:${tag}`),
}));
vi.mock('@/lib/auth/session', () => ({
  requireRole: async (role: string) => {
    calls.push(`requireRole:${role}`);
    if (state.forbidden) throw new Error('NEXT_FORBIDDEN');
    return { id: 'admin-1' };
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    calls.push('createClient');
    return { marker: 'client' };
  },
}));
vi.mock('@/lib/about/service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/about/service')>('@/lib/about/service');
  return {
    parseToken: actual.parseToken,
    saveAboutDraft: async (_c: unknown, args: unknown) => {
      calls.push(`saveAboutDraft:${JSON.stringify(args)}`);
      return state.save;
    },
    publishAbout: async (_c: unknown, args: unknown) => {
      calls.push(`publishAbout:${JSON.stringify(args)}`);
      return state.publish;
    },
    restoreAboutRevision: async (_c: unknown, args: unknown) => {
      calls.push(`restoreAboutRevision:${JSON.stringify(args)}`);
      return state.restore;
    },
  };
});
vi.mock('@/lib/about/finalize-photo', () => ({
  finalizeAboutPhotoWith: async (_c: unknown, path: unknown) => {
    calls.push(`finalizeAboutPhotoWith:${String(path)}`);
    return state.photo;
  },
}));
vi.mock('@/lib/about/photo-gc', () => ({
  sweepAboutPhotos: async () => {
    calls.push('sweepAboutPhotos');
    return 0;
  },
}));

const actions = await import('@/app/painel/sobre/actions');

beforeEach(() => {
  calls.length = 0;
  state.forbidden = false;
  state.save = { kind: 'saved', updatedAt: 't1', content: {} };
  state.publish = { kind: 'published', updatedAt: 't2', content: {} };
  state.restore = { kind: 'restored', updatedAt: 't3', content: {} };
  state.photo = { ok: true, path: 'site/sobre/x.webp' };
});

const invalidations = () =>
  calls.filter((c) => c.startsWith('updateTag:') || c.startsWith('revalidatePath:'));

describe('guarda: só a administração', () => {
  const all: [string, () => Promise<unknown>][] = [
    [
      'saveAboutDraftAction',
      () => actions.saveAboutDraftAction({ content: {}, expectedUpdatedAt: null }),
    ],
    [
      'publishAboutAction',
      () => actions.publishAboutAction({ content: {}, expectedUpdatedAt: 't' }),
    ],
    [
      'restoreAboutRevisionAction',
      () => actions.restoreAboutRevisionAction({ revisionId: 1, expectedUpdatedAt: null }),
    ],
    ['finalizeAboutPhoto', () => actions.finalizeAboutPhoto('site/sobre/incoming/x.jpg')],
  ];

  it.each(all)(
    '%s chama requireRole("admin") ANTES de qualquer outra coisa',
    async (_name, run) => {
      await run();
      expect(calls[0]).toBe('requireRole:admin');
    },
  );

  it.each(all)(
    '%s: quem não é da administração é barrado (403) sem tocar no banco, no Storage nem no cache',
    async (_name, run) => {
      state.forbidden = true;
      await expect(run()).rejects.toThrow('NEXT_FORBIDDEN');
      expect(calls).toEqual(['requireRole:admin']);
    },
  );
});

describe('o token de concorrência', () => {
  it.each([undefined, 42, '', 'a'.repeat(65), {}, [], true])(
    'um token inválido (%j) é recusado sem ir ao serviço',
    async (token) => {
      const outcome = await actions.saveAboutDraftAction({
        content: {},
        expectedUpdatedAt: token as never,
      });
      expect(outcome.kind).toBe('error');
      expect(calls.some((c) => c.startsWith('saveAboutDraft:'))).toBe(false);
      expect(
        (await actions.publishAboutAction({ content: {}, expectedUpdatedAt: token as never })).kind,
      ).toBe('error');
      expect(
        (
          await actions.restoreAboutRevisionAction({
            revisionId: 1,
            expectedUpdatedAt: token as never,
          })
        ).kind,
      ).toBe('error');
    },
  );

  it('o token chega ao serviço como o texto exato que a tela mandou', async () => {
    await actions.saveAboutDraftAction({
      content: { a: 1 },
      expectedUpdatedAt: '2026-10-06T15:00:00.123456+00:00',
    });
    expect(calls).toContain(
      'saveAboutDraft:{"content":{"a":1},"expectedUpdatedAt":"2026-10-06T15:00:00.123456+00:00"}',
    );
  });
});

describe('cache público', () => {
  it('salvar o rascunho NUNCA expira o cache público (rascunho nunca é lido por visitante)', async () => {
    await actions.saveAboutDraftAction({ content: {}, expectedUpdatedAt: null });
    expect(invalidations()).toEqual([]);
  });

  it('publicar expira a tag site:sobre e a rota /sobre', async () => {
    await actions.publishAboutAction({ content: {}, expectedUpdatedAt: 't' });
    expect(invalidations()).toEqual(['updateTag:site:sobre', 'revalidatePath:/sobre']);
  });

  it('restaurar expira a tag site:sobre e a rota /sobre', async () => {
    await actions.restoreAboutRevisionAction({ revisionId: 4, expectedUpdatedAt: 't' });
    expect(invalidations()).toEqual(['updateTag:site:sobre', 'revalidatePath:/sobre']);
  });

  it.each([
    ['conflict', { kind: 'conflict', server: null }],
    ['invalid', { kind: 'invalid', issue: 'invalid', fields: [], message: 'x' }],
    ['error', { kind: 'error', message: 'x' }],
  ])(
    'publicar com resultado "%s" NÃO expira nada (o que está no ar não mudou)',
    async (_label, outcome) => {
      state.publish = outcome;
      await actions.publishAboutAction({ content: {}, expectedUpdatedAt: 't' });
      expect(invalidations()).toEqual([]);
      expect(calls).not.toContain('sweepAboutPhotos');
    },
  );

  it.each([
    ['conflict', { kind: 'conflict', server: null }],
    ['error', { kind: 'error', message: 'x' }],
  ])('restaurar com resultado "%s" NÃO expira nada', async (_label, outcome) => {
    state.restore = outcome;
    await actions.restoreAboutRevisionAction({ revisionId: 4, expectedUpdatedAt: 't' });
    expect(invalidations()).toEqual([]);
  });

  it('finalizar a foto nunca expira o cache (a foto só entra no conteúdo quando se salva e só vai ao ar quando se publica)', async () => {
    await actions.finalizeAboutPhoto('site/sobre/incoming/x.jpg');
    expect(invalidations()).toEqual([]);
  });
});

describe('varredura de fotos', () => {
  it('roda depois de salvar, publicar, restaurar e finalizar (só quando deu certo)', async () => {
    await actions.saveAboutDraftAction({ content: {}, expectedUpdatedAt: null });
    await actions.publishAboutAction({ content: {}, expectedUpdatedAt: 't' });
    await actions.restoreAboutRevisionAction({ revisionId: 1, expectedUpdatedAt: 't' });
    await actions.finalizeAboutPhoto('site/sobre/incoming/x.jpg');
    expect(calls.filter((c) => c === 'sweepAboutPhotos')).toHaveLength(4);
  });

  it('não roda quando salvar falha', async () => {
    state.save = { kind: 'conflict', server: null };
    await actions.saveAboutDraftAction({ content: {}, expectedUpdatedAt: null });
    expect(calls).not.toContain('sweepAboutPhotos');
  });
});

describe('foto', () => {
  it('só repassa o caminho ao núcleo (que confere o formato) e devolve o resultado', async () => {
    const result = await actions.finalizeAboutPhoto('site/sobre/incoming/x.jpg');
    expect(result).toEqual({ ok: true, path: 'site/sobre/x.webp' });
    expect(calls).toContain('finalizeAboutPhotoWith:site/sobre/incoming/x.jpg');
  });
});
