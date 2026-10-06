/*
 * Texto simples do conteúdo da página Sobre, puro. O servidor normaliza ANTES de validar e de gravar; o editor usa as
 * mesmas funções para os contadores, então a tela e o banco concordam. O banco conta em caracteres (`char_length`, por
 * code point), não em unidades UTF-16.
 */

// Controle (menos \n), DEL e os invisíveis que servem para esconder texto ou imitar outra coisa: zero-width, marcas de
// direção e sobreposição e o hífen suave (os mesmos dos comentários).
const INVISIBLE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F­​-‏‪-‮⁠⁦-⁩﻿]/g;

/** Tamanho como o banco conta: por code point. */
export function charCount(text: string): number {
  return Array.from(text).length;
}

/** Campo de uma linha só (título, rótulo): sem invisíveis, qualquer espaço ou quebra vira um espaço, sem sobra nas pontas. */
export function normalizeLine(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

/**
 * Campo de várias linhas (bio, texto do passo, chamada): quebras normalizadas, no máximo uma linha em branco seguida,
 * sem invisíveis, sem espaço sobrando nas pontas das linhas nem do texto.
 */
export function normalizeMultiline(raw: unknown): string {
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
