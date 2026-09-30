import { describe, expect, it } from 'vitest';

import { canAccessPanelPath, hasRole, panelRequirement, parseRole } from './roles';

describe('parseRole', () => {
  it('keeps known roles', () => {
    expect(parseRole('admin')).toBe('admin');
    expect(parseRole('moderator')).toBe('moderator');
    expect(parseRole('member')).toBe('member');
  });

  it.each([undefined, null, '', 'ADMIN', 'owner', 1])('turns %j into member', (value) => {
    expect(parseRole(value)).toBe('member');
  });
});

describe('hasRole', () => {
  it.each([
    ['admin', 'admin', true],
    ['admin', 'staff', true],
    ['moderator', 'admin', false],
    ['moderator', 'staff', true],
    ['member', 'admin', false],
    ['member', 'staff', false],
  ] as const)('%s meets %s: %s', (role, requirement, expected) => {
    expect(hasRole(role, requirement)).toBe(expected);
  });
});

describe('panel access', () => {
  it('opens only Comentários to the moderator', () => {
    expect(panelRequirement('/painel/comentarios')).toBe('staff');
    expect(panelRequirement('/painel/comentarios/123')).toBe('staff');
    expect(panelRequirement('/painel')).toBe('admin');
    expect(panelRequirement('/painel/comentariosx')).toBe('admin');
  });

  const paths = [
    '/painel',
    '/painel/sessoes',
    '/painel/sessoes/nova',
    '/painel/livros',
    '/painel/comentarios',
    '/painel/membros',
    '/painel/votacoes',
    '/painel/configuracoes',
  ];

  it('opens everything to the admin', () => {
    for (const path of paths) expect(canAccessPanelPath('admin', path)).toBe(true);
  });

  it('opens nothing but Comentários to the moderator', () => {
    for (const path of paths) {
      expect(canAccessPanelPath('moderator', path)).toBe(path === '/painel/comentarios');
    }
  });

  it('opens nothing to a member', () => {
    for (const path of paths) expect(canAccessPanelPath('member', path)).toBe(false);
  });

  it('only answers about the panel', () => {
    expect(canAccessPanelPath('admin', '/sessoes')).toBe(false);
  });
});
