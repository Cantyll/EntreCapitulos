import { describe, expect, it } from 'vitest';

import { liveCommentsBySession, type CommentRow } from './live-comments';

const row = (
  id: string,
  status: string,
  parent_id: string | null = null,
  session_id = 's1',
): CommentRow => ({ id, session_id, parent_id, status });

describe('liveCommentsBySession', () => {
  it('conta aprovados e em análise', () => {
    const counts = liveCommentsBySession([row('a', 'approved'), row('b', 'pending')]);
    expect(counts.get('s1')).toBe(2);
  });

  it('não conta comentário removido', () => {
    expect(liveCommentsBySession([row('a', 'removed')]).get('s1')).toBeUndefined();
  });

  it('não conta resposta que ficou embaixo de um comentário removido', () => {
    const counts = liveCommentsBySession([row('a', 'removed'), row('b', 'approved', 'a')]);
    expect(counts.get('s1')).toBeUndefined();
  });

  it('conta resposta embaixo de comentário que continua no ar', () => {
    const counts = liveCommentsBySession([row('a', 'approved'), row('b', 'approved', 'a')]);
    expect(counts.get('s1')).toBe(2);
  });

  it('separa por sessão', () => {
    const counts = liveCommentsBySession([
      row('a', 'approved', null, 's1'),
      row('b', 'removed', null, 's2'),
      row('c', 'pending', null, 's3'),
    ]);
    expect([...counts.entries()]).toEqual([
      ['s1', 1],
      ['s3', 1],
    ]);
  });
});
