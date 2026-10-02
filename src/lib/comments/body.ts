/*
 * Texto do comentário, puro. O servidor normaliza e valida ANTES de gravar; o compositor usa as mesmas
 * funções para o contador, então a tela e o banco concordam. O banco tem a última palavra
 * (`char_length(body)` de 1 a 2000, contado em caracteres, não em unidades UTF-16).
 */

export const COMMENT_MAX_LENGTH = 2000;

// Controle (menos \n), DEL, e os invisíveis que servem para esconder link ou imitar outra pessoa:
// zero-width (U+200B a U+200D, U+2060, U+FEFF), marcas de direção e sobreposição (U+200E, U+200F,
// U+202A a U+202E, U+2066 a U+2069) e o hífen suave (U+00AD).
const INVISIBLE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F­​-‏‪-‮⁠⁦-⁩﻿]/g;

/**
 * Quebras normalizadas (`\r\n` e `\r` viram `\n`), sem caracteres de controle nem invisíveis, no máximo
 * uma linha em branco seguida, sem espaço sobrando nas pontas das linhas nem do texto, em NFC.
 * Aceita qualquer coisa e devolve texto: quem valida o tamanho é `validateCommentBody`.
 */
export function normalizeCommentBody(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(INVISIBLE, '')
    .replace(/[  ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Tamanho como o banco conta: por code point. */
export function commentLength(text: string): number {
  return Array.from(text).length;
}

export type BodyCheck =
  { ok: true; body: string } | { ok: false; error: 'empty' | 'too_long'; body: string };

export function validateCommentBody(raw: unknown): BodyCheck {
  const body = normalizeCommentBody(raw);
  if (commentLength(body) < 1) return { ok: false, error: 'empty', body };
  if (commentLength(body) > COMMENT_MAX_LENGTH) return { ok: false, error: 'too_long', body };
  return { ok: true, body };
}
