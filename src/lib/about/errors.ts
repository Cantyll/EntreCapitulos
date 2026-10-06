/*
 * Erros do banco da página Sobre. Mapear SEMPRE pelo prefixo da mensagem (`site_page_conflict:`…), nunca só pelo
 * código: `not_admin:` e um `permission denied` cru compartilham o `42501`. Nada aqui devolve o texto do erro do banco
 * (a mensagem pode repetir o conteúdo editado): só o texto fixo em pt-BR.
 */

/** Tabela ou função ausente: a migration ainda não foi aplicada (Database deploy). */
const UNAVAILABLE_CODES = ['PGRST202', 'PGRST205', 'PGRST200', '42883', '42P01'];

type DbError = { code?: unknown } | null | undefined;

const codeOf = (error: DbError): string => (typeof error?.code === 'string' ? error.code : '');

/** Função ou tabela inexistente: "falta aplicar a atualização do banco". */
export function isAboutUnavailable(error: DbError): boolean {
  return UNAVAILABLE_CODES.includes(codeOf(error));
}
