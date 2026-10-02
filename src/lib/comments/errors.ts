/*
 * Erros do banco nos comentários, em pt-BR. Só lê `code` e o prefixo da `message` para classificar; nada
 * disso vai para a tela nem para o log (o log usa `describeFailure`, que nunca imprime a mensagem).
 */
type DbErrorLike = { code?: string | null; message?: string | null };

export const COMMENT_MESSAGES = {
  profile_incomplete: 'Escolha o nome que aparece nos seus comentários antes de comentar.',
  session_not_published: 'Esta sessão não está no ar.',
  comments_closed: 'Os comentários desta sessão estão fechados.',
  invalid_parent: 'Não dá para responder a esse comentário. Atualize a página e tente de novo.',
  not_signed_in: 'Entre no clube para comentar.',
  not_found: 'Não encontramos esta sessão. Atualize a página.',
  empty: 'Escreva alguma coisa antes de publicar.',
  too_long: 'O comentário passa de 2000 caracteres.',
  invalid_spoiler: 'Escolha um capítulo válido para o aviso de spoiler.',
  generic: 'Não foi possível publicar agora. Seu texto continua aqui; tente de novo em instantes.',
} as const;

export type CommentMessageKey = keyof typeof COMMENT_MESSAGES;

const PREFIXES = [
  'profile_incomplete',
  'session_not_published',
  'comments_closed',
  'invalid_parent',
] as const satisfies readonly CommentMessageKey[];

export function classifyCommentError(error: DbErrorLike | null | undefined): CommentMessageKey {
  if (!error) return 'generic';
  const message = error.message ?? '';
  for (const prefix of PREFIXES) if (message.startsWith(`${prefix}:`)) return prefix;

  switch (error.code) {
    // RLS: sem sessão, ou login anônimo.
    case '42501':
      return 'not_signed_in';
    // Chave estrangeira: a sessão ou o comentário-pai não existe.
    case '23503':
      return 'invalid_parent';
    default:
      return 'generic';
  }
}

// --- Moderação ---------------------------------------------------------------------------------------

export const MODERATION_MESSAGES = {
  conflict: 'Outra pessoa já moderou este comentário. Atualize a página.',
  not_found: 'Comentário não encontrado. Atualize a página.',
  invalid_spoiler: 'Escolha um capítulo válido para o aviso de spoiler.',
  invalid_input: 'Pedido inválido. Atualize a página e tente de novo.',
  forbidden: 'Só a equipe pode moderar comentários.',
  generic: 'Não foi possível salvar agora. Tente de novo em instantes.',
} as const;

export type ModerationMessageKey = keyof typeof MODERATION_MESSAGES;

export function classifyModerationError(
  error: DbErrorLike | null | undefined,
): ModerationMessageKey {
  if (!error) return 'generic';
  if (error.code === '42501') return 'forbidden';
  return 'generic';
}
