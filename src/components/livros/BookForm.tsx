'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react';

import { createBook, updateBook } from '@/app/painel/livros/actions';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IDLE_BOOK_STATE, type BookActionState } from '@/lib/books/action-state';
import { GENRES_MAX, GENRE_MAX_LENGTH, TOTAL_CHAPTERS_MAX } from '@/lib/books/validation';
import { ADMIN_BOOKS_HREF, adminBookHref } from '@/lib/routes';

import styles from './books.module.css';
import { RatingSelect } from './RatingSelect';
import { FieldError, StatusNote } from './StatusNote';
import { uploadCover, validateCoverFile } from './upload-cover';

type BookFormProps =
  | { mode: 'create' }
  | {
      mode: 'edit';
      book: {
        id: string;
        title: string;
        author: string;
        synopsis: string | null;
        genres: string[];
        totalChapters: number;
      };
    };

/** Gêneros como chips: Enter ou vírgula adiciona, o × remove. O valor vai num campo oculto. */
function GenreChips({ initial, error }: { initial: string[]; error?: string }) {
  const id = useId();
  const [genres, setGenres] = useState<string[]>(initial);
  const [draft, setDraft] = useState('');

  function commit(raw: string) {
    const parts = raw
      .split(',')
      .map((p) => p.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    if (parts.length === 0) return;
    setGenres((current) => {
      const next = [...current];
      for (const part of parts) {
        if (next.length >= GENRES_MAX) break;
        if (!next.some((g) => g.toLowerCase() === part.toLowerCase()))
          next.push(part.slice(0, GENRE_MAX_LENGTH));
      }
      return next;
    });
    setDraft('');
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id}>Gêneros</label>
      <input type="hidden" name="genres" value={genres.join(',')} />
      {genres.length > 0 && (
        <ul
          className={styles.chips}
          aria-label="Gêneros escolhidos"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {genres.map((genre) => (
            <li key={genre} className={styles.chip}>
              {genre}
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Remover o gênero ${genre}`}
                onClick={() => setGenres((current) => current.filter((g) => g !== genre))}
              >
                <Icon name="x" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        className={styles.input}
        value={draft}
        maxLength={GENRE_MAX_LENGTH}
        placeholder="Fantasia, romance…"
        aria-describedby={`${id}-dica ${id}-erro`}
        disabled={genres.length >= GENRES_MAX}
        onChange={(event) => {
          const value = event.target.value;
          if (value.includes(',')) commit(value);
          else setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(draft);
          }
        }}
        onBlur={() => commit(draft)}
      />
      <small id={`${id}-dica`}>Digite e aperte Enter ou vírgula. Até {GENRES_MAX} gêneros.</small>
      <FieldError id={`${id}-erro`} message={error} />
    </div>
  );
}

export function BookForm(props: BookFormProps) {
  const router = useRouter();
  const editing = props.mode === 'edit';
  const book = editing ? props.book : null;

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<'queued' | 'reading' | 'finished'>('queued');
  const uid = useId();

  // O arquivo da capa NÃO vai no FormData (o campo não tem `name`): a Vercel limita o corpo da
  // requisição. Depois de salvar o livro, ele segue direto para o Storage.
  const [state, action, pending] = useActionState<BookActionState, FormData>(
    async (previous, formData) => {
      const result = editing
        ? await updateBook(previous, formData)
        : await createBook(previous, formData);
      if (result.status === 'ok' && result.bookId && file) {
        const upload = await uploadCover(result.bookId, file);
        if (!upload.ok) {
          return {
            ...result,
            message: `${result.message} Mas a capa não foi enviada: ${upload.message}`,
            errors: { cover: upload.message },
          };
        }
      }
      return result;
    },
    IDLE_BOOK_STATE,
  );

  const [, startTransition] = useTransition();

  // Tudo certo: volta para a lista. Se só a capa falhou, fica na página (com o aviso) e leva à edição.
  const coverFailed = Boolean(state.errors?.cover);
  useEffect(() => {
    if (state.status === 'ok' && !coverFailed) router.push(ADMIN_BOOKS_HREF);
  }, [state, coverFailed, router]);

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setFileError(null);
    if (!chosen) return;
    const invalid = validateCoverFile(chosen);
    if (invalid) {
      setFileError(invalid);
      event.target.value = '';
      return;
    }
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  }

  const err = state.errors ?? {};
  const fieldClass = (name: string) => `${styles.input} ${err[name] ? styles.invalid : ''}`;

  return (
    <form
      // Sem `action={...}`: o React 19 zera os campos quando uma action termina, e um erro de
      // validação não pode apagar o que a pessoa digitou.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
      className={`${styles.card} ${styles.formCard}`}
      noValidate
    >
      <div className={styles.formGrid}>
        {book && <input type="hidden" name="bookId" value={book.id} />}

        <div className={styles.field}>
          <label htmlFor={`${uid}-title`}>Título</label>
          <input
            id={`${uid}-title`}
            name="title"
            className={fieldClass('title')}
            defaultValue={book?.title}
            maxLength={200}
            autoComplete="off"
            aria-invalid={err.title ? true : undefined}
            aria-describedby={`${uid}-title-erro`}
            required
          />
          <FieldError id={`${uid}-title-erro`} message={err.title} />
        </div>

        <div className={styles.field}>
          <label htmlFor={`${uid}-author`}>Autor</label>
          <input
            id={`${uid}-author`}
            name="author"
            className={fieldClass('author')}
            defaultValue={book?.author}
            maxLength={200}
            autoComplete="off"
            aria-invalid={err.author ? true : undefined}
            aria-describedby={`${uid}-author-erro`}
            required
          />
          <FieldError id={`${uid}-author-erro`} message={err.author} />
        </div>

        <div className={styles.field}>
          <label htmlFor={`${uid}-synopsis`}>Sinopse</label>
          <textarea
            id={`${uid}-synopsis`}
            name="synopsis"
            className={`${styles.textarea} ${err.synopsis ? styles.invalid : ''}`}
            defaultValue={book?.synopsis ?? ''}
            maxLength={4000}
            aria-describedby={`${uid}-synopsis-erro`}
          />
          <FieldError id={`${uid}-synopsis-erro`} message={err.synopsis} />
        </div>

        <GenreChips initial={book?.genres ?? []} error={err.genres} />

        <div className={styles.field}>
          <label htmlFor={`${uid}-total`}>Total de capítulos</label>
          <input
            id={`${uid}-total`}
            name="total_chapters"
            type="number"
            inputMode="numeric"
            min={1}
            max={TOTAL_CHAPTERS_MAX}
            className={fieldClass('total_chapters')}
            defaultValue={book?.totalChapters ?? ''}
            aria-invalid={err.total_chapters ? true : undefined}
            aria-describedby={`${uid}-total-dica ${uid}-total-erro`}
            required
          />
          <small id={`${uid}-total-dica`}>
            Uma estimativa: pode mudar quando você souber o número certo.
          </small>
          <FieldError id={`${uid}-total-erro`} message={err.total_chapters} />
        </div>

        {!editing && (
          <>
            <div className={styles.field}>
              <label htmlFor={`${uid}-status`}>Estado inicial</label>
              <select
                id={`${uid}-status`}
                name="status"
                className={styles.select}
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="queued">Na fila</option>
                <option value="reading">Lendo agora</option>
                <option value="finished">Já terminado</option>
              </select>
              <small>“Lendo agora” só funciona se nenhum outro livro estiver em leitura.</small>
            </div>
            {status === 'finished' && (
              <div className={styles.fields}>
                <div className={styles.field}>
                  <label htmlFor={`${uid}-rating`}>Nota</label>
                  <RatingSelect
                    id={`${uid}-rating`}
                    invalid={Boolean(err.rating)}
                    describedBy={`${uid}-rating-erro`}
                  />
                  <FieldError id={`${uid}-rating-erro`} message={err.rating} />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`${uid}-finished`}>Terminado em</label>
                  <input
                    id={`${uid}-finished`}
                    name="finished_at"
                    type="date"
                    className={fieldClass('finished_at')}
                    aria-invalid={err.finished_at ? true : undefined}
                    aria-describedby={`${uid}-finished-erro`}
                    required
                  />
                  <FieldError id={`${uid}-finished-erro`} message={err.finished_at} />
                </div>
              </div>
            )}
          </>
        )}

        <div className={styles.field}>
          <label htmlFor={`${uid}-cover`}>Capa</label>
          <input
            ref={fileRef}
            id={`${uid}-cover`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className={styles.input}
            onChange={onFile}
            aria-describedby={`${uid}-cover-dica ${uid}-cover-erro`}
          />
          <small id={`${uid}-cover-dica`}>
            PNG, JPG ou WEBP, até 5 MB. O site usa as cores da capa como tema.
          </small>
          <FieldError id={`${uid}-cover-erro`} message={fileError ?? undefined} />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:), não passa pelo otimizador
            <img src={preview} alt="Prévia da capa escolhida" className={styles.preview} />
          )}
        </div>

        <StatusNote state={state} />

        <div className={styles.actions}>
          <Button type="submit" disabled={pending}>
            {pending ? 'Salvando…' : editing ? 'Salvar livro' : 'Criar livro'}
          </Button>
          {state.status === 'ok' && coverFailed && state.bookId && (
            <ButtonLink href={adminBookHref(state.bookId)} variant="soft">
              Ir para o livro e tentar a capa de novo
            </ButtonLink>
          )}
        </div>
      </div>
    </form>
  );
}
