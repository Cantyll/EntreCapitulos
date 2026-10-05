import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/painel/membros/actions', () => ({
  showMemberContact: vi.fn(),
  changeMemberRole: vi.fn(),
  setMemberSuspension: vi.fn(),
  deleteMember: vi.fn(),
  searchMembers: vi.fn(),
}));

const { ContactReveal } = await import('@/components/membros/ContactReveal');
const { MembersList } = await import('@/components/membros/MembersList');
const { DeleteControl } = await import('@/components/membros/DeleteControl');
const { RoleControl } = await import('@/components/membros/RoleControl');
const { MembersStats } = await import('@/components/membros/MembersStats');

/*
 * O HTML que o servidor manda: o e-mail nunca está nele (só o mascarado, na lista), as ações estão onde devem e
 * os números do topo são os que vieram do banco, sem nada inventado.
 */
const ID = 'aaaaaaaa-1111-4222-8333-444444444444';
const FULL_EMAIL = 'fulana.silva@exemplo.com';

const rows = [
  {
    id: ID,
    displayName: 'Fulana Silva',
    role: 'member' as const,
    createdAt: '2026-10-01T10:00:00Z',
    approvedCount: 3,
    suspended: false,
    joined: '1 de outubro de 2026',
    maskedEmail: 'f***@exemplo.com',
  },
  {
    id: 'bbbbbbbb-1111-4222-8333-444444444444',
    displayName: 'Beltrana',
    role: 'moderator' as const,
    createdAt: '2026-09-01T10:00:00Z',
    approvedCount: 10,
    suspended: true,
    joined: '1 de setembro de 2026',
    maskedEmail: '***',
  },
];

describe('"Mostrar e-mail"', () => {
  it('a página abre SEM e-mail: só o botão e o aviso de que a consulta é registrada', () => {
    const html = renderToStaticMarkup(createElement(ContactReveal, { memberId: ID }));
    expect(html).toContain('Mostrar e-mail');
    expect(html).toContain('Cada consulta fica registrada');
    expect(html).not.toContain('@');
    expect(html).not.toContain('Último acesso');
  });
});

describe('a lista', () => {
  const html = renderToStaticMarkup(
    createElement(MembersList, { rows, showEmail: true, emptyText: 'Ninguém' }),
  );

  it('mostra só o e-mail mascarado', () => {
    expect(html).toContain('f***@exemplo.com');
    expect(html).not.toContain(FULL_EMAIL);
    expect(html).not.toMatch(/[a-z]+\.[a-z]+@/);
  });

  it('cada pessoa tem um link em cada desenho (tabela e cartões) e nenhum botão', () => {
    expect(
      html.match(/href="\/painel\/membros\/aaaaaaaa-1111-4222-8333-444444444444"/g),
    ).toHaveLength(2);
    expect(html).not.toContain('<button');
    expect(html).toContain('data-tour="members-table"');
  });

  it('usa os rótulos neutros e a situação de cada pessoa', () => {
    expect(html).toContain('Moderação');
    expect(html).toContain('Membro');
    expect(html).toContain('Suspenso');
    expect(html).toContain('Ativo');
    expect(html).not.toMatch(/Moderadora|Autora/);
  });

  it('sem a coluna de e-mail quando o banco não consegue ler os dados da conta', () => {
    const without = renderToStaticMarkup(
      createElement(MembersList, { rows, showEmail: false, emptyText: 'Ninguém' }),
    );
    expect(without).not.toContain('f***@exemplo.com');
    expect(without).not.toContain('E-mail');
  });

  it('lista vazia mostra o texto vazio', () => {
    const empty = renderToStaticMarkup(
      createElement(MembersList, { rows: [], showEmail: true, emptyText: 'Ninguém neste filtro' }),
    );
    expect(empty).toContain('Ninguém neste filtro');
    expect(empty).not.toContain('<table');
  });
});

describe('os quatro números do topo', () => {
  it('são os do banco; contagem que falhou vira "—"', () => {
    const html = renderToStaticMarkup(
      createElement(MembersStats, {
        stats: { total: 1280, staff: 3, suspended: null, recent: 0 },
      }),
    );
    expect(html).toContain('1.280');
    expect(html).toContain('>3<');
    expect(html).toContain('>—<');
    expect(html).toContain('>0<');
    expect(html).toContain('data-tour="members-stats"');
  });
});

describe('diálogos das ações (fechados no HTML do servidor)', () => {
  it('a exclusão mostra as contagens reais e os avisos obrigatórios', () => {
    const html = renderToStaticMarkup(
      createElement(DeleteControl, {
        memberId: ID,
        name: 'Fulana Silva',
        impact: { comments: 4, replies: 1 },
        isStaff: false,
      }),
    );
    expect(html).toContain('data-tour="member-delete"');
    expect(html).toContain('Excluir conta…');
    expect(html).toContain('4 comentários');
    expect(html).toContain('1 resposta');
    expect(html).toContain('Não há volta');
    expect(html).toContain('cópias de segurança podem guardar');
    expect(html).toContain('não impede');
    expect(html).toContain('Suspender comentários');
    expect(html).toContain('EXCLUIR');
  });

  it('contagem que falhou é dita com franqueza, sem número inventado', () => {
    const html = renderToStaticMarkup(
      createElement(DeleteControl, {
        memberId: ID,
        name: 'Fulana',
        impact: { comments: null, replies: null },
        isStaff: false,
      }),
    );
    expect(html).toContain('não foi possível contar');
  });

  it('equipe não tem botão de exclusão: a instrução é retirar o cargo antes', () => {
    const html = renderToStaticMarkup(
      createElement(DeleteControl, {
        memberId: ID,
        name: 'Beltrana',
        impact: { comments: 0, replies: 0 },
        isStaff: true,
      }),
    );
    expect(html).not.toContain('Excluir conta…');
    expect(html).toContain('mude o cargo para Membro');
  });

  it('o cargo mostra o atual, as três opções neutras e bloqueia equipe para quem está suspenso', () => {
    const html = renderToStaticMarkup(
      createElement(RoleControl, { memberId: ID, name: 'Fulana', role: 'member', suspended: true }),
    );
    expect(html).toContain('data-tour="member-role"');
    expect(html).toContain('Administração');
    expect(html).toContain('Moderação');
    expect(html).toContain('Membro (atual)');
    expect(html.match(/<option[^>]*disabled[^>]*>/g)).toHaveLength(2);
    expect(html).toContain('reative-os antes de dar um cargo de equipe');
  });
});
