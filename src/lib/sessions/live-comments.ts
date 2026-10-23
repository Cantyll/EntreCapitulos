/*
 * Comentários que "seguram" uma sessão: os que ainda existem para alguém. Comentário removido (pela
 * moderação ou pela própria pessoa) é só escondido, e uma resposta que ficou embaixo de um removido
 * também some da página. Nenhum dos dois impede a sessão de voltar para rascunho nem de ser excluída.
 * O banco decide de verdade (`unpublish_session` e o gatilho `reading_sessions_guard_delete`, mesma
 * regra); isto só esconde botões que o banco recusaria.
 */
export type CommentRow = {
  id: string;
  session_id: string;
  parent_id: string | null;
  status: string;
};

export function liveCommentsBySession(rows: readonly CommentRow[]): Map<string, number> {
  const removed = new Set(rows.filter((row) => row.status === 'removed').map((row) => row.id));
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status === 'removed') continue;
    if (row.parent_id !== null && removed.has(row.parent_id)) continue;
    counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1);
  }
  return counts;
}
