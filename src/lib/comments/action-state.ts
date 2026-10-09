import type { CommentMessageKey } from './errors';

/** Resposta da Server Action `createComment` (o compositor usa com `useActionState`). */
export type CommentActionState =
  | { status: 'idle'; message: '' }
  | { status: 'ok'; message: string; outcome: 'approved' | 'pending'; commentId: string }
  | { status: 'error'; message: string; code: CommentMessageKey };

export const IDLE_COMMENT_STATE: CommentActionState = { status: 'idle', message: '' };
