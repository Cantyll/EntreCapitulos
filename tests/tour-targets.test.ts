import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TOUR_CHAPTERS, TOUR_STEPS } from '@/content/tour/steps';

/*
 * Tutorial do painel (etapa 8k): todo alvo (`data-tour="…"`) citado por um passo existe no código da página do passo.
 * Os passos sem rota (capítulos 9 e 10) só podem apontar para a moldura do painel (barra lateral, barra de baixo,
 * topo, "?"), que existe em toda tela. No tour da moderação, a página do passo precisa ser uma que ela abre.
 */

const ROOT = process.cwd();

/** Onde mora o código de cada página do painel. */
const PAGE_SOURCES: Record<string, string[]> = {
  '/painel': ['src/app/painel/page.tsx'],
  '/painel/livros': ['src/app/painel/livros', 'src/components/livros'],
  '/painel/sessoes': ['src/app/painel/sessoes/page.tsx', 'src/components/sessoes/SessionsList.tsx'],
  '/painel/sessoes/nova': ['src/components/sessoes'],
  '/painel/comentarios': ['src/app/painel/comentarios', 'src/components/moderacao'],
  '/painel/membros': ['src/app/painel/membros', 'src/components/membros'],
  '/painel/sobre': ['src/app/painel/sobre', 'src/components/sobre/editor'],
};

/** A moldura do painel: está em toda tela (para a administração e para a moderação). */
const SHELL = ['src/components/admin', 'src/components/tour/HelpButton.tsx'];

/** O que a moderação abre no painel: só Comentários (e a moldura). */
const MODERATOR_ROUTES = new Set(['/painel/comentarios']);

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

function sourceOf(paths: string[]): string {
  return paths
    .flatMap(files)
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

function declares(source: string, target: string): boolean {
  return source.includes(`data-tour="${target}"`) || source.includes(`dataTour="${target}"`);
}

const shell = sourceOf(SHELL);

describe('alvos do tutorial', () => {
  it('toda rota de passo tem o código da página mapeado', () => {
    for (const step of TOUR_STEPS) {
      if (step.route) expect(PAGE_SOURCES[step.route], `${step.id}: ${step.route}`).toBeDefined();
    }
  });

  it.each(TOUR_STEPS.filter((step) => step.target).map((step) => [step.id, step]))(
    '%s: o alvo existe na página do passo',
    (_id, step) => {
      const page = step.route ? sourceOf(PAGE_SOURCES[step.route]!) : '';
      expect(
        declares(page, step.target!) || declares(shell, step.target!),
        `${step.id}: data-tour="${step.target}" não encontrado em ${step.route ?? 'moldura do painel'}`,
      ).toBe(true);
    },
  );

  it('o alvo substituto (celular) fica na moldura do painel, presente em toda tela', () => {
    const withAlt = TOUR_STEPS.filter((step) => step.altTarget);
    expect(withAlt.length).toBeGreaterThan(0);
    for (const step of withAlt) {
      expect(declares(shell, step.altTarget!), `${step.id}: ${step.altTarget}`).toBe(true);
    }
  });

  it('o tour da moderação só aponta para telas que a moderação abre', () => {
    const moderatorChapters = TOUR_CHAPTERS.filter((c) => c.roles.includes('moderator')).map(
      (c) => c.id,
    );
    for (const step of TOUR_STEPS.filter((s) => moderatorChapters.includes(s.chapter))) {
      if (step.route) expect(MODERATOR_ROUTES.has(step.route), step.id).toBe(true);
      if (!step.route && step.target) expect(declares(shell, step.target), step.id).toBe(true);
    }
  });

  it('os alvos da gestão de membros e da Página Sobre continuam lá (reaproveitados das etapas 8f e 8j)', () => {
    const members = sourceOf(PAGE_SOURCES['/painel/membros']!);
    for (const name of [
      'members-stats',
      'members-search',
      'members-filters',
      'members-table',
      'members-roles-card',
    ]) {
      expect(declares(members, name), name).toBe(true);
    }
    const about = sourceOf(PAGE_SOURCES['/painel/sobre']!);
    for (const name of [
      'about-editor',
      'about-photo',
      'about-intro',
      'about-sections',
      'about-links',
      'about-toggles',
      'about-preview',
      'about-save',
      'about-publish',
      'about-history',
    ]) {
      expect(declares(about, name), name).toBe(true);
    }
  });
});
