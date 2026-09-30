import { redirect } from 'next/navigation';

import { bookHref } from '@/lib/routes';
import { currentBook } from '@/lib/sample-data';

/** Atalho estável para o livro que está sendo lido agora. */
export default function CurrentBookShortcut() {
  redirect(bookHref(currentBook.slug));
}
