import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * `requireUserId` é a identidade sem perfil: serve às Server Actions que gravam o próprio perfil e
 * não podem deixar o `getCurrentUser` memoizar o perfil antigo para o resto da requisição.
 */

const getClaims = vi.fn();
const maybeSingle = vi.fn();
const from = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle }) }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-ec-path': '/sessoes' }),
}));
vi.mock('next/navigation', () => ({
  forbidden: () => {
    throw new Error('FORBIDDEN');
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getClaims }, from }),
}));

const { requireUserId, getCurrentUser } = await import('@/lib/auth/session');

describe('requireUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devolve o id do JWT sem ler o perfil', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });

    await expect(requireUserId()).resolves.toBe('user-1');
    expect(from).not.toHaveBeenCalled();
  });

  it('sem sessão, vai para /entrar e volta para a página pedida', async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    await expect(requireUserId()).rejects.toThrow('NEXT_REDIRECT:/entrar?next=%2Fsessoes');
  });

  it('login anônimo conta como deslogado', async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'anon', is_anonymous: true } },
      error: null,
    });

    await expect(requireUserId()).rejects.toThrow('NEXT_REDIRECT');
  });
});

describe('getCurrentUser', () => {
  it('continua lendo o perfil (nome e papel vêm do banco)', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });
    maybeSingle.mockResolvedValue({
      data: { display_name: 'Marina', avatar_url: null, role: 'member' },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toEqual({
      id: 'user-1',
      displayName: 'Marina',
      avatarUrl: null,
      role: 'member',
    });
    expect(from).toHaveBeenCalledWith('profiles');
  });
});
