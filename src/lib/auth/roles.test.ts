import { describe, expect, it } from 'vitest';

import { adminNav, getAdminNavFor, getAdminTabbar } from '../navigation';
import { hasRole, isStaff, panelHomeFor, parseRole } from './roles';

describe('hasRole', () => {
  it('admin acessa tudo', () => {
    expect(hasRole('admin', 'admin')).toBe(true);
    expect(hasRole('admin', 'staff')).toBe(true);
  });

  it('moderator só cumpre o requisito staff', () => {
    expect(hasRole('moderator', 'staff')).toBe(true);
    expect(hasRole('moderator', 'admin')).toBe(false);
  });

  it('membro não cumpre nenhum', () => {
    expect(hasRole('member', 'staff')).toBe(false);
    expect(hasRole('member', 'admin')).toBe(false);
    expect(isStaff('member')).toBe(false);
  });
});

describe('parseRole', () => {
  it('valores desconhecidos viram membro', () => {
    expect(parseRole('admin')).toBe('admin');
    expect(parseRole('moderator')).toBe('moderator');
    expect(parseRole('superuser')).toBe('member');
    expect(parseRole(null)).toBe('member');
    expect(parseRole(undefined)).toBe('member');
  });
});

describe('painel por papel', () => {
  it('a moderadora vê só Comentários', () => {
    expect(getAdminNavFor('moderator').map((i) => i.label)).toEqual(['Comentários']);
  });

  it('a administradora vê todos os itens', () => {
    expect(getAdminNavFor('admin')).toHaveLength(adminNav.length);
  });

  it('membro não vê nenhum item', () => {
    expect(getAdminNavFor('member')).toEqual([]);
  });

  it('"Nova sessão" só para a administradora', () => {
    expect(getAdminTabbar('admin').canCreateSession).toBe(true);
    expect(getAdminTabbar('moderator').canCreateSession).toBe(false);
  });

  it('a página inicial do painel depende do papel', () => {
    expect(panelHomeFor('admin')).toBe('/painel');
    expect(panelHomeFor('moderator')).toBe('/painel/comentarios');
  });
});
