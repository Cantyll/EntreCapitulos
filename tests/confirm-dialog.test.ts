import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/*
 * ConfirmDialog (etapa 8f: saiu de components/sessoes/ para components/ui/). O comportamento do <dialog>
 * (foco, Esc, teclado) é conferido nos testes E2E; aqui ficam o HTML e as regras de estilo da folha inferior.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const element = (props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) =>
  createElement(
    ConfirmDialog,
    {
      open: false,
      title: 'Excluir?',
      confirmLabel: 'Excluir',
      busyLabel: 'Excluindo…',
      busy: false,
      onConfirm: () => {},
      onClose: () => {},
      ...props,
    },
    createElement('p', null, 'Sem volta.'),
  );

const render = (props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) =>
  renderToStaticMarkup(element(props));

describe('ConfirmDialog (HTML)', () => {
  it('o título nomeia o diálogo (aria-labelledby aponta para o h2)', () => {
    const html = render();
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`<h2 id="${labelledBy}">Excluir?</h2>`);
  });

  it('dois diálogos na mesma tela não repetem o id (antes os dois usavam "dialogo-titulo")', () => {
    const both = renderToStaticMarkup(
      createElement(Fragment, null, element(), element({ title: 'Outro?' })),
    );
    const ids = [...both.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(both).not.toContain('dialogo-titulo');
  });

  it('ocupado: troca o rótulo, desabilita os botões e não deixa cancelar', () => {
    const html = render({ busy: true });
    expect(html).toContain('Excluindo…');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it('o erro aparece dentro do diálogo como alerta', () => {
    expect(render({ error: 'Deu errado.' })).toMatch(/<p role="alert"[^>]*>Deu errado\.<\/p>/);
  });
});

describe('ConfirmDialog (folha inferior no toque)', () => {
  const css = read('src/components/ui/ConfirmDialog.module.css');
  const touch = css.slice(css.indexOf('@media (pointer: coarse)'));

  it('só em tela de toque, encostada embaixo e acima do teclado', () => {
    expect(css).toContain('@media (pointer: coarse)');
    expect(touch).toMatch(/position:\s*fixed/);
    expect(touch).toMatch(/inset:\s*auto 0 var\(--kb, 0px\) 0/);
  });

  it('altura em dvh (nunca vh), safe areas e rolagem interna', () => {
    expect(css).not.toMatch(/\b\d+vh\b/);
    expect(css).toMatch(/max-height:\s*calc\(100dvh/);
    expect(touch).toContain('var(--safe-bottom)');
    expect(css).toMatch(/overflow-y:\s*auto/);
  });

  it('campos de 16px, botões de 44px e sem animação com prefers-reduced-motion', () => {
    // O corpo da regra dos campos (não qualquer `font-size: 16px` que venha depois, como o do `.error`).
    expect(touch).toMatch(
      /\.body input,\s*\.body select,\s*\.body textarea\s*\{[^}]*font-size:\s*16px/,
    );
    expect(touch).toMatch(/\.body\s*\{[^}]*font-size:\s*16px/);
    expect(touch).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation:\s*none/);
  });

  it('um título com palavra longa (nome sem espaço) não alarga a folha', () => {
    expect(css).toMatch(/\.body\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.body h2\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });

  it('o foco inicial no "Cancelar" é opt-in: os usos antigos seguem com o primeiro elemento focável', () => {
    const code = read('src/components/ui/ConfirmDialog.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).toMatch(/initialFocus === 'cancel'/);
    expect(code).not.toMatch(/if \(danger\) cancelRef/);
    for (const file of [
      'src/components/sessoes/SessionEditor.tsx',
      'src/components/sessoes/SessionRowActions.tsx',
    ]) {
      expect(read(file), file).not.toContain('initialFocus');
    }
    for (const file of [
      'src/components/membros/DeleteControl.tsx',
      'src/components/membros/SuspensionControl.tsx',
    ]) {
      expect(read(file), file).toMatch(/initialFocus=/);
    }
  });

  it('Esc duas vezes durante a ação reabre o diálogo (o Chromium fecha o segundo mesmo cancelado)', () => {
    const code = read('src/components/ui/ConfirmDialog.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).toMatch(
      /if \(busy && open && dialog && !dialog\.open\) \{\s*dialog\.showModal\(\);\s*return;/,
    );
  });

  it('o componente não usa confirm() do navegador e devolve o foco a quem abriu', () => {
    const code = read('src/components/ui/ConfirmDialog.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\bconfirm\(/);
    expect(code).toMatch(/opener\.current/);
    expect(code).toMatch(/useId\(\)/);
  });

  it('os dois usos antigos importam o componente de components/ui', () => {
    for (const file of [
      'src/components/sessoes/SessionEditor.tsx',
      'src/components/sessoes/SessionRowActions.tsx',
    ]) {
      expect(read(file), file).toContain("from '@/components/ui/ConfirmDialog'");
    }
  });
});
