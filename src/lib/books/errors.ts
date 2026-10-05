/*
 * Mensagens de erro do banco e do Storage em pt-BR. Só lê `code` e o prefixo da `message` para
 * classificar; nada disso vai para a tela nem para o log (o log usa `describeFailure`).
 */
type DbErrorLike = { code?: string | null; message?: string | null; status?: number | null };

export const BOOK_MESSAGES = {
  book_already_reading:
    'Já existe um livro em leitura. Marque o livro atual como terminado antes de começar outro.',
  book_not_queued: 'Só um livro da fila pode começar a ser lido.',
  book_not_reading: 'Só o livro que está em leitura pode ser marcado como terminado.',
  invalid_rating: 'A nota vai de 0 a 5, de meio em meio ponto.',
  not_admin: 'Só a administração pode fazer isso.',
  book_not_found: 'Livro não encontrado. Atualize a página.',
  slug_taken: 'Já existe um livro com esse título. Mude um pouco o título.',
  chapters: 'O capítulo atual não pode passar do total de capítulos.',
  has_sessions: 'Este livro tem sessões e não pode ser excluído. Exclua ou mova as sessões antes.',
  migration_pending:
    'Falta aplicar a atualização do banco (Actions → Database deploy). Veja o README.',
  generic: 'Não foi possível salvar agora. Tente de novo em instantes.',
} as const;

export type BookMessageKey = keyof typeof BOOK_MESSAGES;

const PREFIXES: readonly BookMessageKey[] = [
  'book_already_reading',
  'book_not_queued',
  'book_not_reading',
  'invalid_rating',
  'not_admin',
  'book_not_found',
];

export function classifyBookError(error: DbErrorLike | null | undefined): BookMessageKey {
  if (!error) return 'generic';
  const message = error.message ?? '';
  for (const prefix of PREFIXES) if (message.startsWith(`${prefix}:`)) return prefix;

  switch (error.code) {
    // Função ainda não existe no banco (migration não aplicada): PostgREST ou Postgres.
    case 'PGRST202':
    case '42883':
      return 'migration_pending';
    case '23505':
      // O índice books_single_reading (outro livro em leitura) ou o slug único.
      return /books_single_reading/.test(message) ? 'book_already_reading' : 'slug_taken';
    case '23514':
      return /current_chapter/.test(message) ? 'chapters' : 'generic';
    case '23503':
      return 'has_sessions';
    case '42501':
      return 'not_admin';
    default:
      return 'generic';
  }
}

export const bookErrorMessage = (error: DbErrorLike | null | undefined): string =>
  BOOK_MESSAGES[classifyBookError(error)];
