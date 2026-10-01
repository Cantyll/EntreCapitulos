/** Resposta das Server Actions de livros: aviso em pt-BR e, se for o caso, erro por campo. */
export type BookActionState = {
  status: 'idle' | 'ok' | 'error';
  message: string;
  errors?: Record<string, string>;
  /** Id do livro criado ou alterado (o formulário usa para enviar a capa em seguida). */
  bookId?: string;
};

export const IDLE_BOOK_STATE: BookActionState = { status: 'idle', message: '' };
