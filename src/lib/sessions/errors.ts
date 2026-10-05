/*
 * Erros do banco nas sessões, em pt-BR. Só lê `code` e o prefixo da `message` para classificar; nada
 * disso vai para a tela nem para o log (o log usa `describeFailure`).
 */
type DbErrorLike = { code?: string | null; message?: string | null; details?: string | null };

export const SESSION_MESSAGES = {
  not_admin: 'Só a administração pode fazer isso.',
  session_not_found: 'Sessão não encontrada. Atualize a página.',
  book_not_found: 'O livro desta sessão não foi encontrado.',
  invalid_state: 'A sessão já mudou de estado em outro lugar. Atualize a página.',
  session_has_comments:
    'Esta sessão já tem comentários e não pode voltar para rascunho. Para tirar a discussão do ar, feche os comentários.',
  chapter_beyond_total: 'A sessão passa do total de capítulos do livro. Corrija o total do livro.',
  overlap: 'Esses capítulos já pertencem a outra sessão.',
  number_taken: 'Outra sessão acabou de ficar com esse número. Tente de novo.',
  has_comments:
    'Esta sessão tem comentários e não pode ser excluída. Feche os comentários se quiser encerrar a discussão.',
  migration_pending: 'Falta aplicar a atualização do banco (Database deploy). Veja o README.',
  generic: 'Não foi possível salvar agora. Tente de novo em instantes.',
} as const;

export type SessionMessageKey = keyof typeof SESSION_MESSAGES;

const PREFIXES: readonly SessionMessageKey[] = [
  'not_admin',
  'session_not_found',
  'book_not_found',
  'invalid_state',
  'session_has_comments',
  'chapter_beyond_total',
];

export function classifySessionError(error: DbErrorLike | null | undefined): SessionMessageKey {
  if (!error) return 'generic';
  const message = error.message ?? '';
  for (const prefix of PREFIXES) if (message.startsWith(`${prefix}:`)) return prefix;

  switch (error.code) {
    // Função ainda não existe no banco (migration não aplicada): PostgREST ou Postgres.
    case 'PGRST202':
    case '42883':
      return 'migration_pending';
    case '23P01':
      return 'overlap';
    case '23505':
      return 'number_taken';
    case '23503':
      return 'has_comments';
    case '23514':
      // books_current_chapter_range: o capítulo atual do livro passaria do total.
      return /current_chapter/.test(`${message} ${error.details ?? ''}`)
        ? 'chapter_beyond_total'
        : 'generic';
    case '42501':
      return 'not_admin';
    default:
      return 'generic';
  }
}

export function chapterBeyondTotalMessage(total: number, chapterTo: number): string {
  return `O livro tem ${total} capítulos e esta sessão vai até o ${chapterTo}. Corrija o total do livro.`;
}

export function overlapMessage(from: number, to: number, sessionNumber: number): string {
  const range =
    from === to ? `O capítulo ${from} já pertence` : `Os capítulos ${from} a ${to} já pertencem`;
  return `${range} à sessão ${sessionNumber}.`;
}

export type SessionErrorContext = { total?: number; chapterTo?: number };

export function sessionErrorMessage(
  error: DbErrorLike | null | undefined,
  context: SessionErrorContext = {},
): string {
  const key = classifySessionError(error);
  if (key === 'chapter_beyond_total' && context.total != null && context.chapterTo != null) {
    return chapterBeyondTotalMessage(context.total, context.chapterTo);
  }
  return SESSION_MESSAGES[key];
}
