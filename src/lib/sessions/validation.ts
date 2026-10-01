import { z } from 'zod';

import { CHAPTER_MAX } from '@/lib/session-body';
import { ratingSchema, TOTAL_CHAPTERS_MAX } from '@/lib/books/validation';

/*
 * Validação do que o editor manda, no servidor. A lista de campos de `sessionFieldsSchema` é FIXA
 * (`strictObject`): status, published_at, book_id, number e id nunca vêm do cliente, e um campo a
 * mais é recusado em vez de ignorado. O status só muda pelas funções publish/unpublish do banco.
 */

export const TITLE_MAX = 200;
export const EXCERPT_MAX_INPUT = 300;
export const NOTE_TEXT_MAX = 4000;
export const NOTE_REFERENCE_MAX = 200;
export const QUESTION_TEXT_MAX = 1000;
/** O banco exige título (1 a 200); rascunho sem título grava isto e o editor mostra o campo vazio. */
export const UNTITLED = 'Sem título';

export const sessionFieldsSchema = z
  .strictObject({
    title: z.string().max(TITLE_MAX, `Use no máximo ${TITLE_MAX} caracteres no título.`),
    // Conferido por `parseBody` (esquema do corpo), com mensagens próprias.
    body: z.unknown(),
    chapterFrom: z.number().int().min(1).max(CHAPTER_MAX),
    chapterTo: z.number().int().min(1).max(CHAPTER_MAX),
    visibility: z.enum(['public', 'members']),
    commentsOpen: z.boolean(),
    rating: ratingSchema.nullable(),
    excerpt: z
      .string()
      .max(EXCERPT_MAX_INPUT, `O resumo aceita até ${EXCERPT_MAX_INPUT} caracteres.`),
  })
  .refine((f) => f.chapterFrom <= f.chapterTo, {
    message: 'O capítulo inicial não pode passar do final.',
    path: ['chapterTo'],
  });

export type SessionFields = z.infer<typeof sessionFieldsSchema>;

export const noteSchema = z.strictObject({
  kind: z.enum(['quote', 'note'], { error: 'Escolha trecho ou anotação.' }),
  text: z
    .string()
    .trim()
    .min(1, 'Escreva o trecho ou a anotação.')
    .max(NOTE_TEXT_MAX, `Use no máximo ${NOTE_TEXT_MAX} caracteres.`),
  reference: z
    .string()
    .trim()
    .max(NOTE_REFERENCE_MAX, `A referência aceita até ${NOTE_REFERENCE_MAX} caracteres.`),
});

export const questionSchema = z.strictObject({
  text: z
    .string()
    .trim()
    .min(1, 'Escreva a pergunta.')
    .max(QUESTION_TEXT_MAX, `Use no máximo ${QUESTION_TEXT_MAX} caracteres.`),
});

export const totalForBookSchema = z.number().int().min(1).max(TOTAL_CHAPTERS_MAX);

export const uuidSchema = z.uuid();
