import { stableStringify } from '@/lib/session-editor/snapshot';

import { ABOUT_LIMITS } from './limits';
import type { AboutFieldError, AboutLink, AboutSection, AboutStep, AboutContent } from './schema';
import { normalizeAbout } from './schema';

/*
 * O modelo do formulário do editor da página Sobre, puro (sem React nem DOM): o conteúdo com uma CHAVE em cada item
 * das listas (seções, links e passos), para a ordem poder mudar sem o React confundir os campos nem os editores de
 * texto. As chaves existem só no navegador: `toContent` as tira antes de qualquer envio. As chaves iniciais são
 * determinísticas (`ini-seções-0`…), iguais no servidor e no navegador (sem divergência de hidratação); as novas
 * vêm de um contador.
 */

export type Keyed<T> = T & { key: string };

export type FormContent = Omit<AboutContent, 'sections' | 'links' | 'howItWorks'> & {
  sections: Keyed<AboutSection>[];
  links: Keyed<AboutLink>[];
  howItWorks: { visible: boolean; steps: Keyed<AboutStep>[] };
};

export const keyOf = (prefix: string, index: number): string => `${prefix}-${index}`;

/** Conteúdo → formulário, com as chaves iniciais. */
export function toForm(content: AboutContent, prefix = 'ini'): FormContent {
  return {
    ...content,
    sections: content.sections.map((section, i) => ({
      ...section,
      key: keyOf(`${prefix}-secao`, i),
    })),
    links: content.links.map((link, i) => ({ ...link, key: keyOf(`${prefix}-link`, i) })),
    howItWorks: {
      visible: content.howItWorks.visible,
      steps: content.howItWorks.steps.map((step, i) => ({
        ...step,
        key: keyOf(`${prefix}-passo`, i),
      })),
    },
  };
}

function stripKey<T extends { key: string }>(item: T): Omit<T, 'key'> {
  const copy: Partial<T> = { ...item };
  delete copy.key;
  return copy as Omit<T, 'key'>;
}

/** Formulário → conteúdo, sem as chaves (a forma que o servidor valida). */
export function toContent(form: FormContent): AboutContent {
  return {
    ...form,
    sections: form.sections.map((section) => stripKey(section)),
    links: form.links.map((link) => stripKey(link)),
    howItWorks: {
      visible: form.howItWorks.visible,
      steps: form.howItWorks.steps.map((step) => stripKey(step)),
    },
  };
}

/** Troca o item de lugar com o vizinho (`delta` -1 sobe, +1 desce). Nos extremos devolve a mesma lista. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export const removeAt = <T>(list: readonly T[], index: number): T[] =>
  list.filter((_, i) => i !== index);

/** Os limites de quantidade, num só lugar para a tela (botões "Adicionar") e os testes. */
export const canAddSection = (count: number) => count < ABOUT_LIMITS.sectionsMax;
export const canAddLink = (count: number) => count < ABOUT_LIMITS.linksMax;
export const canAddStep = (count: number) => count < ABOUT_LIMITS.stepsMax;
export const canRemoveStep = (count: number) => count > ABOUT_LIMITS.stepsMin;

/**
 * Assinatura para saber se há alterações não salvas: o conteúdo normalizado, com as chaves de objeto em ordem (o jsonb
 * do banco devolve outra ordem). Duas assinaturas iguais = nada mudou.
 */
export function contentSignature(content: AboutContent): string {
  return stableStringify(normalizeAbout(content));
}

export const isDirty = (form: FormContent, baseline: string): boolean =>
  contentSignature(toContent(form)) !== baseline;

/** O primeiro aviso de cada campo (`title`, `sections.0.title`…), para mostrar junto do campo. */
export function fieldErrorMap(fields: readonly AboutFieldError[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) if (!(field.path in out)) out[field.path] = field.message;
  return out;
}

/** O texto que se anuncia (aria-live) depois de mover um item: "Seção 2 movida para a posição 1 de 3." */
export function moveAnnouncement(
  noun: string,
  feminine: boolean,
  from: number,
  to: number,
  total: number,
): string {
  return `${noun} ${from + 1} ${feminine ? 'movida' : 'movido'} para a posição ${to + 1} de ${total}.`;
}
