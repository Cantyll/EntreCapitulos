import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { INSTALL_CARD, INSTALL_GUIDE, INSTALL_HINT, INSTALL_RULES, INSTALL_STEPS } from './install';

/** Todo texto que o CARTÃO e a DICA mostram (nunca as seções de /sobre e /conta). */
const cardTexts: string[] = [
  ...INSTALL_STEPS.map((step) => step.text),
  ...Object.values(INSTALL_CARD),
  ...Object.values(INSTALL_HINT),
];

describe('INSTALL_RULES', () => {
  it('a chave do localStorage é única e versionada', () => {
    expect(INSTALL_RULES.storageKey).toBe('ec:install:v1');
    expect(INSTALL_RULES.storageKey).toMatch(/^ec:install:v\d+$/);
  });

  it('o site público mostra a partir da 2ª visita', () => {
    expect(INSTALL_RULES.minVisitsPublic).toBe(2);
  });

  it('"Agora não" esconde por 60 dias', () => {
    expect(INSTALL_RULES.dismissDays).toBe(60);
  });

  it('a pré-visualização é ?instalacao=ver', () => {
    expect(INSTALL_RULES.previewParam).toBe('instalacao');
    expect(INSTALL_RULES.previewValue).toBe('ver');
  });

  it('as rotas excluídas incluem as três combinadas (e só começam por barra)', () => {
    expect(INSTALL_RULES.excludedPaths).toContain('/entrar');
    expect(INSTALL_RULES.excludedPaths).toContain('/boas-vindas');
    expect(INSTALL_RULES.excludedPaths).toContain('/conta/excluida');
    for (const path of INSTALL_RULES.excludedPaths) {
      expect(path.startsWith('/')).toBe(true);
      expect(path.endsWith('/')).toBe(false);
    }
  });

  it('o atributo que marca erro e 404 é data-no-install-card', () => {
    expect(INSTALL_RULES.suppressAttribute).toBe('data-no-install-card');
  });

  it('o componente NoInstallCard usa exatamente esse atributo', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/install/NoInstallCard.tsx'),
      'utf8',
    );
    // O atributo do código (fora dos comentários) é exatamente o da regra.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const attributes = [...code.matchAll(/\bdata-[\w-]+/g)].map((match) => match[0]);
    expect(attributes).toEqual([INSTALL_RULES.suppressAttribute]);
    expect(code).toContain(`<span hidden ${INSTALL_RULES.suppressAttribute}="" />`);
  });

  it('o InstallGate procura o marcador pelo nome da regra, não por um texto copiado', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/install/InstallGate.tsx'),
      'utf8',
    );
    expect(source).toContain('INSTALL_RULES.suppressAttribute');
    expect(source).not.toContain("'data-no-install-card'");
    expect(source).not.toContain('"data-no-install-card"');
  });
});

describe('INSTALL_STEPS', () => {
  it('são exatamente três passos, com estes textos', () => {
    expect(INSTALL_STEPS).toHaveLength(3);
    expect(INSTALL_STEPS.map((step) => step.text)).toEqual([
      'Toque em Compartilhar.',
      'Escolha Adicionar à Tela de Início.',
      'Toque em Adicionar.',
    ]);
  });

  it('os ids são os três passos, na ordem, sem repetir', () => {
    expect(INSTALL_STEPS.map((step) => step.id)).toEqual(['share', 'add', 'confirm']);
  });

  it('cada passo é uma frase curta', () => {
    for (const step of INSTALL_STEPS) {
      expect(step.text.length).toBeLessThanOrEqual(60);
      expect(step.text).toMatch(/\.$/);
    }
  });
});

describe('textos do cartão e da dica', () => {
  it('o cartão tem os textos combinados', () => {
    expect(INSTALL_CARD.regionLabel).toBe('Instalar o Entre Capítulos');
    expect(INSTALL_CARD.title).toBe('Instale o Entre Capítulos');
    expect(INSTALL_CARD.later).toBe('Agora não');
    expect(INSTALL_CARD.installed).toBe('Já instalei');
  });

  it('a dica tem os textos combinados', () => {
    expect(INSTALL_HINT.regionLabel).toBe('Dica de instalação');
    expect(INSTALL_HINT.text).toBe('Para instalar como aplicativo, abra este site no Safari.');
    expect(INSTALL_HINT.later).toBe('Agora não');
  });

  it('há texto para conferir', () => {
    expect(cardTexts.length).toBeGreaterThanOrEqual(10);
    for (const text of cardTexts) expect(text.trim().length).toBeGreaterThan(0);
  });

  it('nenhum cita versão do iOS ou do iPadOS (nem "iOS 17", nem "16.4")', () => {
    for (const text of cardTexts) {
      expect(text, text).not.toMatch(/\b(iOS|iPadOS|iPhone OS)\s*\d/i);
      expect(text, text).not.toMatch(/\b(iOS|iPadOS)\b[^.]*\b\d+(?:[._]\d+)*\b/i);
      expect(text, text).not.toMatch(/\b(1[6-9]|2\d|30)(?:\.\d+)*\b/);
      expect(text, text).not.toMatch(/\bvers[aã]o\b/i);
    }
  });

  it('nenhum fala de "Abrir como app da Web", "Editar Ações" nem do botão "⋯"', () => {
    for (const text of cardTexts) {
      expect(text, text).not.toMatch(/Abrir como app da Web/i);
      expect(text, text).not.toMatch(/app da Web/i);
      expect(text, text).not.toMatch(/Editar A[cç][õo]es/i);
      expect(text, text).not.toContain('⋯');
    }
  });

  it('os códigos que montam o cartão não repetem as observações no código', () => {
    for (const file of [
      'src/components/install/InstallCard.tsx',
      'src/components/install/InstallSteps.tsx',
    ]) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source, file).not.toMatch(/Abrir como app da Web/i);
      expect(source, file).not.toMatch(/Editar A[cç][õo]es/i);
      expect(source, file).not.toMatch(/INSTALL_GUIDE/);
    }
  });
});

describe('INSTALL_GUIDE (seções de /sobre e /conta)', () => {
  it('traz a observação sobre "Abrir como app da Web"', () => {
    expect(INSTALL_GUIDE.notes.some((note) => /Abrir como app da Web/.test(note))).toBe(true);
  });

  it('traz a observação sobre "Editar Ações"', () => {
    expect(INSTALL_GUIDE.notes.some((note) => /Editar Ações/.test(note))).toBe(true);
  });

  it('a observação do "app da Web" é condicional, para valer em mais de uma versão', () => {
    const note = INSTALL_GUIDE.notes.find((item) => /Abrir como app da Web/.test(item))!;
    expect(note).toMatch(/^Se o iOS mostrar a opção/);
    expect(note).toMatch(/deixe-a ligada/);
  });

  it('as observações não amarram nenhuma versão do iOS', () => {
    for (const note of INSTALL_GUIDE.notes) {
      expect(note, note).not.toMatch(/\b(iOS|iPadOS)\s*\d/i);
      expect(note, note).not.toMatch(/\b(1[6-9]|2\d|30)(?:\.\d+)*\b/);
    }
  });

  it('os títulos são os combinados', () => {
    expect(INSTALL_GUIDE.about.title).toBe('Leia como aplicativo');
    expect(INSTALL_GUIDE.account.title).toBe('Instalar no iPhone');
  });

  it('as observações são curtas e sem repetição', () => {
    expect(new Set(INSTALL_GUIDE.notes).size).toBe(INSTALL_GUIDE.notes.length);
    for (const note of INSTALL_GUIDE.notes) expect(note.length).toBeLessThanOrEqual(160);
  });

  it('as seções também não citam versão do iOS', () => {
    for (const copy of [INSTALL_GUIDE.about, INSTALL_GUIDE.account]) {
      expect(copy.title).not.toMatch(/\b(iOS|iPadOS)\s*\d/i);
      expect(copy.lead).not.toMatch(/\b(iOS|iPadOS)\s*\d/i);
      expect(copy.lead).not.toMatch(/\b(1[6-9]|2\d|30)(?:\.\d+)*\b/);
    }
  });
});
