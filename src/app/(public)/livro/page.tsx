import { redirect } from 'next/navigation';

import { getCurrentBook } from '@/lib/public/loaders';
import { bookHref } from '@/lib/routes';

/**
 * Atalho estável para o livro que está sendo lido agora. Sem livro em leitura, vai para a estante
 * (o redirecionamento é temporário: o livro atual muda).
 */
export default async function CurrentBookShortcut() {
  const book = await getCurrentBook();
  redirect(book ? bookHref(book.slug) : '/estante');
}
