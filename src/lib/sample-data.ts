/**
 * Dados de exemplo da Fase 0. Saem quando o Supabase entrar (Fase 1).
 * O livro atual é real; os demais livros e os membros do protótipo são fictícios.
 */
export const currentBook = {
  slug: 'o-livro-de-azrael',
  title: 'O Livro de Azrael',
  author: 'Amber V. Nicole',
} as const;

export const adminProfile = {
  name: 'Agatha Montinelli',
  role: 'Administradora',
} as const;

/** Comentários esperando aprovação: alimenta o contador do menu e o ponto do sino no painel. */
export const pendingCommentsCount = 5;
