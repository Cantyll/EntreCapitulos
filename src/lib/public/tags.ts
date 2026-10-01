import { updateTag } from 'next/cache';

/*
 * Tags do cache de dados públicos. As Server Actions que criam, editam, publicam, voltam para
 * rascunho ou excluem livro ou sessão chamam estas funções: `updateTag` expira o dado na hora, então
 * a próxima visita já vê a mudança (sem esperar o prazo de segurança de 5 minutos).
 *
 * `updateTag` só funciona dentro de Server Action. Quem chama de outro lugar (route handler)
 * precisa de `revalidateTag`.
 */

export const BOOKS_TAG = 'books';
export const SESSIONS_TAG = 'sessions';
export const sessionTag = (id: string) => `session:${id}`;

/** Livro criado, editado, começado, terminado, com capa ou tema novo, ou excluído. */
export function invalidateBooks(): void {
  updateTag(BOOKS_TAG);
}

/** Sessão criada, editada (já no ar), publicada, despublicada ou excluída; notas e perguntas dela. */
export function invalidateSession(id?: string): void {
  updateTag(SESSIONS_TAG);
  if (id) updateTag(sessionTag(id));
}
