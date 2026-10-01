import { NextResponse, type NextRequest } from 'next/server';

import { logFailure } from '@/lib/auth/log';
import { getCurrentBook } from '@/lib/public/loaders';
import { bookHref } from '@/lib/routes';

/**
 * Atalho estável para o livro que está sendo lido agora. Sem livro em leitura (ou se a leitura
 * falhar), vai para a estante. É um route handler, e não uma página, para responder um redirecionamento
 * HTTP de verdade (307: o livro atual muda) em vez de um 200 que redireciona depois de começar a streamar.
 */
export async function GET(request: NextRequest) {
  let target = '/estante';
  try {
    const book = await getCurrentBook();
    if (book) target = bookHref(book.slug);
  } catch (error) {
    logFailure('/livro: livro atual', error);
  }
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), 307);
}
