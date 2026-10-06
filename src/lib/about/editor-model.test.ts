import { describe, expect, it } from 'vitest';

import { defaultAbout } from './defaults';
import {
  canAddLink,
  canAddSection,
  canAddStep,
  canRemoveStep,
  contentSignature,
  fieldErrorMap,
  isDirty,
  moveAnnouncement,
  moveItem,
  removeAt,
  toContent,
  toForm,
} from './editor-model';
import { parseAbout, type AboutContent } from './schema';

const rich = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }],
});

function full(): AboutContent {
  return {
    ...defaultAbout(),
    sections: [
      { title: 'A', body: rich('a') },
      { title: 'B', body: rich('b') },
      { title: 'C', body: rich('c') },
    ],
    links: [
      { label: 'L1', url: 'https://um.exemplo.com' },
      { label: 'L2', url: 'https://dois.exemplo.com' },
    ],
  };
}

describe('toForm / toContent', () => {
  it('ida e volta devolvem o mesmo conteúdo (as chaves existem só no formulário)', () => {
    const content = full();
    expect(toContent(toForm(content))).toEqual(content);
    expect(JSON.stringify(toContent(toForm(content)))).not.toContain('"key"');
  });

  it('as chaves iniciais são determinísticas (iguais no servidor e no navegador) e únicas', () => {
    const a = toForm(full());
    const b = toForm(full());
    expect(a.sections.map((s) => s.key)).toEqual(b.sections.map((s) => s.key));
    const keys = [...a.sections, ...a.links, ...a.howItWorks.steps].map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('o conteúdo do formulário passa na validação do servidor', () => {
    expect(parseAbout(toContent(toForm(full()))).ok).toBe(true);
  });
});

describe('moveItem', () => {
  it('sobe e desce trocando com o vizinho', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('nos extremos, e com índice fora da lista, nada muda (e devolve uma cópia)', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 0, -1)).toEqual(list);
    expect(moveItem(list, 2, 1)).toEqual(list);
    expect(moveItem(list, 9, -1)).toEqual(list);
    expect(moveItem(list, -1, 1)).toEqual(list);
    expect(moveItem(list, 0, -1)).not.toBe(list);
  });

  it('não muda a lista de entrada', () => {
    const list = ['a', 'b'];
    moveItem(list, 0, 1);
    expect(list).toEqual(['a', 'b']);
  });

  it('mover as seções muda a ordem do conteúdo, e só a ordem', () => {
    const form = toForm(full());
    const moved = { ...form, sections: moveItem(form.sections, 2, -1) };
    expect(toContent(moved).sections.map((s) => s.title)).toEqual(['A', 'C', 'B']);
    expect(removeAt(moved.sections, 0).map((s) => s.title)).toEqual(['C', 'B']);
  });
});

describe('limites de quantidade', () => {
  it('até 3 seções, 5 links e 6 passos; pelo menos 1 passo', () => {
    expect([canAddSection(2), canAddSection(3)]).toEqual([true, false]);
    expect([canAddLink(4), canAddLink(5)]).toEqual([true, false]);
    expect([canAddStep(5), canAddStep(6)]).toEqual([true, false]);
    expect([canRemoveStep(1), canRemoveStep(2)]).toEqual([false, true]);
  });
});

describe('alterações não salvas', () => {
  it('sem mexer, não está sujo; qualquer mudança suja; desfazer limpa', () => {
    const content = full();
    const baseline = contentSignature(content);
    const form = toForm(content);
    expect(isDirty(form, baseline)).toBe(false);
    expect(isDirty({ ...form, title: 'Outro' }, baseline)).toBe(true);
    expect(isDirty({ ...form, title: content.title }, baseline)).toBe(false);
    expect(isDirty({ ...form, sections: moveItem(form.sections, 0, 1) }, baseline)).toBe(true);
    expect(isDirty({ ...form, stats: { visible: false } }, baseline)).toBe(true);
  });

  it('a ordem das chaves do objeto não importa (o jsonb do banco devolve outra ordem)', () => {
    const content = full();
    const reverseKeys = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reverseKeys)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([k, v]) => [k, reverseKeys(v)]),
            )
          : value;
    const reordered = reverseKeys(content) as AboutContent;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(content));
    expect(contentSignature(reordered)).toBe(contentSignature(content));
  });

  it('espaços e quebras sobrando não contam como mudança (o servidor normaliza)', () => {
    const content = full();
    const form = toForm(content);
    expect(isDirty({ ...form, title: `  ${content.title}  ` }, contentSignature(content))).toBe(
      false,
    );
  });
});

describe('avisos por campo e anúncio', () => {
  it('fica com o PRIMEIRO aviso de cada campo', () => {
    expect(
      fieldErrorMap([
        { path: 'title', message: 'um' },
        { path: 'title', message: 'dois' },
        { path: 'bio', message: 'três' },
      ]),
    ).toEqual({ title: 'um', bio: 'três' });
  });

  it('anuncia a nova posição (concorda em gênero)', () => {
    expect(moveAnnouncement('Seção', true, 1, 0, 3)).toBe('Seção 2 movida para a posição 1 de 3.');
    expect(moveAnnouncement('Link', false, 0, 1, 2)).toBe('Link 1 movido para a posição 2 de 2.');
  });
});
