/**
 * Dados de exemplo da Fase 0 que o painel ainda usa (as páginas públicas já leem do banco). Saem com a
 * moderação de comentários.
 */
export const adminProfile = {
  name: 'Agatha Montinelli',
  role: 'Administradora',
} as const;

/** Comentários esperando aprovação: alimenta o contador do menu e o ponto do sino no painel. */
export const pendingCommentsCount = 5;
