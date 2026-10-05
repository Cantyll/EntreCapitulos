import { describe, expect, it } from 'vitest';

import { comingSoonPages } from '../coming-soon';
import {
  adminNav,
  getAdminNavFor,
  getAdminTabbar,
  getAdminTitle,
  isAdminNavActive,
} from '../navigation';
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
  it('a moderação vê só Comentários', () => {
    expect(getAdminNavFor('moderator').map((i) => i.label)).toEqual(['Comentários']);
  });

  it('a administração vê todos os itens', () => {
    expect(getAdminNavFor('admin')).toHaveLength(adminNav.length);
  });

  it('o menu só tem áreas que existem; as "Em breve" ficam fora, na lateral e em "Mais"', () => {
    expect(adminNav.map((i) => i.label)).toEqual([
      'Visão geral',
      'Sessões',
      'Livros',
      'Comentários',
      'Membros',
    ]);
    const soon = Object.values(comingSoonPages).map((page) => page.href as string);
    const inMenu = adminNav.map((i) => i.href as string);
    for (const href of soon) expect(inMenu).not.toContain(href);
    const bar = getAdminTabbar('admin');
    const inBar = [...bar.left, ...bar.right, ...bar.more].map((i) => i.href as string);
    for (const href of soon) expect(inBar).not.toContain(href);
  });

  it('Membros é só da administração, fica em "Mais" no celular e continua ativo dentro do perfil', () => {
    const item = adminNav.find((i) => i.label === 'Membros')!;
    expect(item.href).toBe('/painel/membros');
    expect(item.access).toBe('admin');
    expect(getAdminNavFor('moderator').map((i) => i.label)).not.toContain('Membros');
    expect(getAdminNavFor('member')).toEqual([]);
    expect(getAdminTabbar('admin').more.map((i) => i.label)).toEqual(['Livros', 'Membros']);
    expect(getAdminTabbar('admin').left.concat(getAdminTabbar('admin').right)).not.toContain(item);
    expect(isAdminNavActive(item, '/painel/membros')).toBe(true);
    expect(isAdminNavActive(item, '/painel/membros/aaaaaaaa-1111-4222-8333-444444444444')).toBe(
      true,
    );
    expect(getAdminTitle('/painel/membros')).toBe('Membros');
    expect(getAdminTitle('/painel/membros/aaaaaaaa-1111-4222-8333-444444444444')).toBe('Membros');
  });

  it('as áreas "Em breve" ainda têm título no topo', () => {
    expect(getAdminTitle('/painel/votacoes')).toBe('Votações');
    expect(getAdminTitle('/painel/configuracoes')).toBe('Configurações');
  });

  it('membro não vê nenhum item', () => {
    expect(getAdminNavFor('member')).toEqual([]);
  });

  it('"Nova sessão" só para a administração', () => {
    expect(getAdminTabbar('admin').canCreateSession).toBe(true);
    expect(getAdminTabbar('moderator').canCreateSession).toBe(false);
  });

  it('a página inicial do painel depende do papel', () => {
    expect(panelHomeFor('admin')).toBe('/painel');
    expect(panelHomeFor('moderator')).toBe('/painel/comentarios');
  });
});
