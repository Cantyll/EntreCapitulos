import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { legalConfig } from '@/content/legal-config';
import { buildPrivacy } from '@/content/legal/privacy';
import { buildTerms } from '@/content/legal/terms';

/*
 * A idade é uma DECLARAÇÃO da pessoa (a caixa do aceite): o site não a verifica. Nenhum texto público nem de
 * interface pode dizer que a idade foi "verificada", "confirmada", "comprovada" ou "validada". A etapa 8i
 * (verificação opcional, por conferência manual) só poderá usar essas palavras depois de existir de verdade e
 * de o advogado opinar: nesse dia este teste é revisto de propósito.
 */

const AGE_CLAIM =
  /\bidade\b[^.\n]{0,60}\b(?:verificad|confirmad|comprovad|validad)[ao]s?\b|\b(?:verificad|confirmad|comprovad|validad)[ao]s?\b[^.\n]{0,60}\bidade\b/i;

/**
 * Fora da varredura: o gerador do documento para o advogado (`docs/revisao-juridica.md`). Ele FALA da verificação
 * de idade (negando-a no que existe hoje e descrevendo as etapas futuras 8h e 8i, NÃO implementadas): não é texto
 * do site nem de interface.
 */
const LAWYER_DOCUMENT_SOURCE = 'src/content/legal/review.ts';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Texto das linhas de código que NÃO são comentário (comentário de código não é texto público). */
function codeLines(source: string): string[] {
  let inBlock = false;
  const lines: string[] = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    if (line.startsWith('//') || line.startsWith('*')) continue;
    lines.push(raw);
  }
  return lines;
}

describe('idade declarada, nunca "verificada"', () => {
  it('a expressão pega as frases proibidas e deixa passar as legítimas', () => {
    for (const bad of [
      'Sua idade foi verificada.',
      'idade confirmada',
      'Verificamos que a idade foi comprovada',
      'maioridade? idade validada com sucesso',
      'confirmada a sua idade',
    ]) {
      expect(AGE_CLAIM.test(bad), bad).toBe(true);
    }
    for (const ok of [
      'O site não verifica a idade de quem cria a conta.',
      'Declaro que tenho 18 anos ou mais.',
      'A identidade vem do JWT verificado.',
      'e-mail confirmado',
    ]) {
      expect(AGE_CLAIM.test(ok), ok).toBe(false);
    }
  });

  it('os textos legais (política com tudo ligado e termos) não dizem que a idade foi verificada', () => {
    const docs = [
      buildPrivacy(legalConfig, { google: true, turnstile: true }),
      buildPrivacy(legalConfig, { google: false, turnstile: false }),
      buildTerms(legalConfig),
    ];
    for (const doc of docs) {
      const text = JSON.stringify(doc);
      expect(text).not.toMatch(AGE_CLAIM);
    }
  });

  it('nenhuma tela nem texto de interface (src/, fora dos testes) diz que a idade foi verificada', () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src'))) {
      if (!/\.(ts|tsx)$/.test(file) || /\.test\.(ts|tsx)$/.test(file)) continue;
      if (file.endsWith(LAWYER_DOCUMENT_SOURCE)) continue;
      for (const line of codeLines(readFileSync(file, 'utf8'))) {
        if (AGE_CLAIM.test(line))
          offenders.push(`${file.slice(process.cwd().length + 1)}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
