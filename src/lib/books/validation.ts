import '@/lib/zod-setup';
import * as z from 'zod';

/*
 * Validação do formulário de livro e do progresso, no servidor. Mensagens em pt-BR. O banco tem as
 * mesmas regras como constraints; isto existe para a pessoa ver um aviso claro, campo a campo.
 */

export const TOTAL_CHAPTERS_MAX = 1000;
export const GENRES_MAX = 8;
export const GENRE_MAX_LENGTH = 40;

const text = (label: string, max: number) =>
  z
    .string({ error: `Preencha ${label}.` })
    .trim()
    .min(1, `Preencha ${label}.`)
    .max(max, `Use no máximo ${max} caracteres em ${label}.`);

/** Nota de 0 a 5 em passos de 0,5. */
export const ratingSchema = z
  .number({ error: 'Escolha uma nota de 0 a 5.' })
  .min(0, 'A nota vai de 0 a 5.')
  .max(5, 'A nota vai de 0 a 5.')
  .refine((n) => Number.isInteger(n * 2), 'A nota anda de meio em meio ponto.');

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .number({ error: `Informe ${label}.` })
    .int(`${label[0]!.toUpperCase()}${label.slice(1)} precisa ser um número inteiro.`)
    .min(min, `${label[0]!.toUpperCase()}${label.slice(1)} não pode ser menor que ${min}.`)
    .max(max, `${label[0]!.toUpperCase()}${label.slice(1)} não pode passar de ${max}.`);

export const totalChaptersSchema = wholeNumber('o total de capítulos', 1, TOTAL_CHAPTERS_MAX);
export const currentChapterSchema = wholeNumber('o capítulo atual', 0, TOTAL_CHAPTERS_MAX);

/** O capítulo atual vai de 0 até o total (o total é uma estimativa, mas não fica abaixo do atual). */
export function checkChapters(current: number, total: number): string | null {
  if (current > total) return 'O total de capítulos não pode ficar abaixo do capítulo atual.';
  return null;
}

/** Aceita "Fantasia, Romance" ou a lista já separada; tira vazios e repetidos (sem diferenciar maiúsculas). */
export function parseGenres(input: string | readonly string[]): string[] {
  const parts = typeof input === 'string' ? input.split(',') : input;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const genre = raw.trim().replace(/\s+/g, ' ');
    const key = genre.toLowerCase();
    if (!genre || seen.has(key)) continue;
    seen.add(key);
    out.push(genre);
  }
  return out;
}

const dateOnly = z
  .string({ error: 'Informe a data.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato certo.')
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
  }, 'Essa data não existe.');

export const bookFieldsSchema = z.object({
  title: text('o título', 200),
  author: text('o autor', 200),
  synopsis: z
    .string()
    .trim()
    .max(4000, 'Use no máximo 4000 caracteres na sinopse.')
    .transform((value) => (value === '' ? null : value)),
  genres: z
    .array(
      z.string().max(GENRE_MAX_LENGTH, `Cada gênero tem no máximo ${GENRE_MAX_LENGTH} caracteres.`),
    )
    .max(GENRES_MAX, `Use no máximo ${GENRES_MAX} gêneros.`),
  total_chapters: totalChaptersSchema,
});

export const createBookSchema = bookFieldsSchema
  .extend({
    status: z.enum(['queued', 'reading', 'finished'], { error: 'Escolha o estado do livro.' }),
    rating: z.number().nullable(),
    finished_at: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.status !== 'finished') return;
    const rating = ratingSchema.safeParse(value.rating);
    if (!rating.success) {
      ctx.addIssue({ code: 'custom', path: ['rating'], message: rating.error.issues[0]!.message });
    }
    const date = dateOnly.safeParse(value.finished_at);
    if (!date.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['finished_at'],
        message: date.error.issues[0]!.message,
      });
    }
  });

export type BookFields = z.infer<typeof bookFieldsSchema>;
export type CreateBookInput = z.infer<typeof createBookSchema>;

/** Campo → primeira mensagem de erro, para mostrar junto de cada campo. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}

/** Lê um número de campo de formulário; vazio ou inválido vira `NaN` (que o zod recusa com a mensagem do campo). */
export function numberField(value: FormDataEntryValue | null): number {
  if (typeof value !== 'string' || value.trim() === '') return Number.NaN;
  return Number(value.trim().replace(',', '.'));
}
