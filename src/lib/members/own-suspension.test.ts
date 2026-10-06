import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  result: { data: null, error: null } as { data: unknown; error: unknown },
  throws: false,
  eqs: [] as string[],
};
const logFailure = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/log', () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (column: string, value: string) => {
        state.eqs.push(`${table}.${column}=${value}`);
        return chain;
      };
      chain.maybeSingle = async () => {
        if (state.throws) throw new Error('rede com ana@exemplo.com');
        return state.result;
      };
      return chain;
    },
  }),
}));

const { isOwnCommentsSuspended } = await import('./own-suspension');

beforeEach(() => {
  state.result = { data: null, error: null };
  state.throws = false;
  state.eqs.length = 0;
  logFailure.mockClear();
});

describe('isOwnCommentsSuspended', () => {
  it('lê só a linha da própria pessoa', async () => {
    state.result = { data: { user_id: 'u1' }, error: null };
    expect(await isOwnCommentsSuspended('u1')).toBe(true);
    expect(state.eqs).toEqual(['member_suspensions.user_id=u1']);
  });

  it('sem linha: não está suspensa', async () => {
    expect(await isOwnCommentsSuspended('u1')).toBe(false);
  });

  it('a leitura falhar vale como "não suspensa", registra só o erro e não quebra a página', async () => {
    state.result = {
      data: null,
      error: { code: 'PGRST205', message: 'tabela de ana@exemplo.com' },
    };
    expect(await isOwnCommentsSuspended('u1')).toBe(false);
    expect(logFailure).toHaveBeenCalledWith('members.own-suspension', expect.anything());
    expect(logFailure.mock.calls[0]![0]).not.toContain('u1');

    state.throws = true;
    expect(await isOwnCommentsSuspended('u1')).toBe(false);
    expect(logFailure).toHaveBeenCalledTimes(2);
  });
});

describe('o compositor da discussão', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

  it('só consulta a suspensão de membro logado, com o nome confirmado e comentários abertos', () => {
    const source = read('src/components/comments/Discussion.tsx');
    expect(source).toMatch(/isOwnCommentsSuspended\(viewer\.id\)/);
    expect(source).toMatch(/viewer\.role === 'member'/);
    expect(source).toMatch(/commentsOpen && viewer !== null && viewer\.nameConfirmed/);
  });

  it('suspensa: o aviso aprovado no lugar do campo, e "Responder" também some (canReply)', () => {
    const source = read('src/components/comments/Discussion.tsx');
    expect(source).toMatch(/!suspended && !termsBlocked;/);
    expect(source).toMatch(/canReply: canComment/);
    expect(source).toContain('COMMENT_MESSAGES.comments_suspended');
  });

  it('a mensagem é exatamente a aprovada, sem motivo nem data', async () => {
    const { COMMENT_MESSAGES } = await import('@/lib/comments');
    expect(COMMENT_MESSAGES.comments_suspended).toBe(
      'Seus comentários estão suspensos. Fale com a administração pelo e-mail de contato.',
    );
  });
});
