import { describe, expect, it } from 'vitest';

import {
  ABOUT_MESSAGES,
  aboutErrorMessage,
  classifyAboutError,
  isAboutUnavailable,
  isExpectedAboutError,
} from './errors';

describe('erros do banco da página Sobre', () => {
  it.each([
    ['not_admin: only the administration can edit the site pages', '42501', 'not_admin'],
    ['site_page_conflict: the draft was changed by someone else', 'P0001', 'conflict'],
    ['site_page_invalid: bad_links', '22023', 'invalid'],
    ['site_page_too_large: the page content is over 128 KB', '54000', 'too_large'],
    ['site_page_no_draft: there is no draft to publish', 'P0002', 'no_draft'],
    ['revision_not_found: no such version', 'P0002', 'revision_not_found'],
  ])('mapeia pelo prefixo: %s', (message, code, key) => {
    expect(classifyAboutError({ message, code })).toBe(key);
    expect(aboutErrorMessage({ message, code })).toBe(
      ABOUT_MESSAGES[key as keyof typeof ABOUT_MESSAGES],
    );
  });

  it('o prefixo decide, não o código: um 42501 cru (permissão do banco) NUNCA vira "só a administração"', () => {
    expect(
      classifyAboutError({ code: '42501', message: 'permission denied for table site_pages' }),
    ).toBe('generic');
    expect(classifyAboutError({ code: 'P0001', message: 'outra coisa' })).toBe('generic');
  });

  it.each(['PGRST202', 'PGRST205', 'PGRST200', '42883', '42P01'])(
    'função ou tabela ausente (%s): falta aplicar a atualização do banco',
    (code) => {
      expect(classifyAboutError({ code, message: 'x' })).toBe('migration_pending');
      expect(isAboutUnavailable({ code })).toBe(true);
    },
  );

  it.each(['40P01', '55P03', '57014'])(
    'deadlock, trava e tempo esgotado (%s): tente de novo',
    (code) => {
      expect(classifyAboutError({ code, message: 'x' })).toBe('busy');
    },
  );

  it('erro desconhecido, nulo ou sem campos: mensagem genérica', () => {
    expect(classifyAboutError(null)).toBe('generic');
    expect(classifyAboutError(undefined)).toBe('generic');
    expect(classifyAboutError({})).toBe('generic');
    expect(classifyAboutError({ code: 'XX000', message: 'boom' })).toBe('generic');
  });

  it('nunca devolve o texto do erro do banco (ele pode repetir o conteúdo editado)', () => {
    const message = aboutErrorMessage({
      code: 'XX000',
      message: 'falhou com o texto "Meu segredo" da Agatha',
    });
    expect(message).toBe(ABOUT_MESSAGES.generic);
    expect(message).not.toContain('segredo');
  });

  it('só o inesperado merece registro', () => {
    expect(isExpectedAboutError({ message: 'site_page_conflict: x' })).toBe(true);
    expect(isExpectedAboutError({ code: '42P01' })).toBe(true);
    expect(isExpectedAboutError({ code: '57014' })).toBe(true);
    expect(isExpectedAboutError({ code: 'XX000', message: 'boom' })).toBe(false);
  });

  it('todas as mensagens estão em pt-BR e nenhuma está vazia', () => {
    for (const text of Object.values(ABOUT_MESSAGES))
      expect(text.trim().length).toBeGreaterThan(10);
  });
});
