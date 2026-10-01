'use client';

import { useActionState } from 'react';

import { startBook } from '@/app/painel/livros/actions';
import { Button } from '@/components/ui/Button';
import { IDLE_BOOK_STATE, type BookActionState } from '@/lib/books/action-state';

import { StatusNote } from './StatusNote';

export function StartBookForm({ bookId, title }: { bookId: string; title: string }) {
  const [state, action, pending] = useActionState<BookActionState, FormData>(
    startBook,
    IDLE_BOOK_STATE,
  );
  return (
    <form action={action}>
      <input type="hidden" name="bookId" value={bookId} />
      <Button
        type="submit"
        variant="soft"
        size="sm"
        disabled={pending}
        aria-label={`Começar a ler ${title}`}
      >
        {pending ? 'Começando…' : 'Começar a ler'}
      </Button>
      <StatusNote state={state} />
    </form>
  );
}
