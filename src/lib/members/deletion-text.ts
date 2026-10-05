/*
 * Linhas de contagem do diálogo "Excluir conta" (etapa 8f). Texto puro, com a concordância certa para 1, para
 * vários e para a contagem que falhou (`null`: o servidor não conseguiu contar; a tela diz isso em vez de
 * mostrar um número inventado).
 */
function amount(value: number, one: string, many: string): string {
  return value === 1 ? `1 ${one}` : `${value.toLocaleString('pt-BR')} ${many}`;
}

/** Os comentários da pessoa, em todos os estados, que são apagados com a conta. */
export function commentsLine(comments: number | null): string {
  if (comments === null) {
    return 'os comentários da pessoa (em todos os estados) serão apagados; não foi possível contar quantos agora;';
  }
  const verb = comments === 1 ? 'será apagado' : 'serão apagados';
  return `${amount(comments, 'comentário', 'comentários')} da pessoa (em todos os estados) ${verb};`;
}

/** As respostas de OUTRAS pessoas aos comentários dela, que somem junto (ficam no banco, mas deixam de aparecer). */
export function repliesLine(replies: number | null): string {
  if (replies === null) {
    return 'as respostas de outras pessoas a esses comentários somem junto; não foi possível contar quantas agora.';
  }
  const verb = replies === 1 ? 'some' : 'somem';
  return `${amount(replies, 'resposta', 'respostas')} de outras pessoas a esses comentários ${verb} junto.`;
}
