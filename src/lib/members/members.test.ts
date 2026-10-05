import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatIsoDay } from '@/lib/site';

import { describeAuditEntry, toAuditEntries } from './audit';
import { isNameConfirmed, normalizeTypedName } from './confirm';
import {
  MEMBER_ERROR_PREFIXES,
  MEMBER_MESSAGES,
  classifyMemberError,
  isUnexpectedMemberError,
} from './errors';
import { buildMemberExport, memberExportFileName, parseAdminExportPayload } from './export';
import { isSameOrigin } from './origin';
import {
  MEMBERS_PAGE_SIZE,
  memberListHref,
  memberPageCount,
  memberPageRange,
  parseMemberFilter,
  parseMemberListParams,
  parseMemberNotice,
  parseMemberPage,
} from './params';
import {
  MEMBER_SEARCH_MAX,
  cleanSearchText,
  likePrefix,
  looksLikeEmail,
  parseNameSearch,
} from './search';

const ID = 'aaaaaaaa-1111-4222-8333-444444444444';
const OTHER_EMAIL = 'outra.pessoa@exemplo.com';

describe('erros do banco (prefixo primeiro, código depois)', () => {
  it('cada prefixo da migration vira a mensagem certa', () => {
    const expected: Record<string, string> = {
      not_admin: 'not_admin',
      unsupported_isolation: 'generic',
      invalid_role: 'invalid_role',
      invalid_input: 'invalid_input',
      target_not_found: 'target_not_found',
      last_admin: 'last_admin',
      self_change: 'self_change',
      role_conflict: 'role_conflict',
      member_suspended: 'member_suspended',
      target_anonymous: 'target_anonymous',
      staff_target: 'staff_target',
      staff_cannot_delete: 'staff_cannot_delete',
      contact_unavailable: 'contact_unavailable',
      too_many: 'generic',
    };
    expect(Object.keys(expected).sort()).toEqual([...MEMBER_ERROR_PREFIXES].sort());
    for (const [prefix, key] of Object.entries(expected)) {
      expect(classifyMemberError({ code: 'P0001', message: `${prefix}: texto` })).toBe(key);
    }
  });

  it('os prefixos da lista são exatamente os que as funções da migration levantam', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261005121725_member_management.sql'),
      'utf8',
    );
    // Só as seções das funções de gestão (antes do trigger de comentários, que tem os próprios prefixos).
    const functions = sql.slice(0, sql.indexOf('-- 9. comments_before_insert()'));
    const raised = new Set(
      [...functions.matchAll(/raise exception\s+'([a-z_]+):/g)].map((match) => match[1]),
    );
    expect([...raised].sort()).toEqual([...MEMBER_ERROR_PREFIXES].sort());
  });

  it('not_admin e um 42501 cru não se confundem', () => {
    expect(classifyMemberError({ code: '42501', message: 'not_admin: só a administração' })).toBe(
      'not_admin',
    );
    expect(classifyMemberError({ code: '42501', message: 'permission denied for table x' })).toBe(
      'permission',
    );
  });

  it.each(['PGRST202', '42883', '42P01', 'PGRST205', 'PGRST200'])(
    '%s: falta aplicar a atualização do banco',
    (code) => {
      const key = classifyMemberError({ code, message: 'qualquer coisa' });
      expect(key).toBe('unavailable');
      expect(MEMBER_MESSAGES[key]).toBe('Falta aplicar a atualização do banco (Database deploy).');
    },
  );

  it.each(['40P01', '55P03', '57014'])('%s: tente de novo, nada foi alterado', (code) => {
    const key = classifyMemberError({ code, message: 'canceling statement' });
    expect(key).toBe('retry');
    expect(MEMBER_MESSAGES.retry).toContain('nada foi alterado');
  });

  it('o prefixo vale mais que o código: role_conflict (P0001) e not_admin (42501)', () => {
    expect(classifyMemberError({ code: '57014', message: 'last_admin: x' })).toBe('last_admin');
  });

  it('sem erro, sem código ou com código desconhecido: genérico', () => {
    expect(classifyMemberError(null)).toBe('generic');
    expect(classifyMemberError(undefined)).toBe('generic');
    expect(classifyMemberError({})).toBe('generic');
    expect(classifyMemberError({ code: 'XX000', message: 'boom' })).toBe('generic');
  });

  it('só os erros inesperados são registrados no log', () => {
    expect(isUnexpectedMemberError('generic')).toBe(true);
    expect(isUnexpectedMemberError('permission')).toBe(true);
    expect(isUnexpectedMemberError('retry')).toBe(true);
    for (const key of ['not_admin', 'last_admin', 'role_conflict', 'unavailable'] as const) {
      expect(isUnexpectedMemberError(key)).toBe(false);
    }
  });

  it('nenhuma mensagem fala em "administradora" nem repete e-mail ou nome', () => {
    for (const text of Object.values(MEMBER_MESSAGES)) {
      expect(text).not.toMatch(/administradora|moderadora/i);
      expect(text).not.toContain('@');
    }
  });
});

describe('busca', () => {
  it('limpa controle, invisíveis e espaços; no máximo 60 caracteres (por code point)', () => {
    expect(cleanSearchText('  Ma\u200Bria \n\t da   Silva\u0007 ')).toBe('Maria da Silva');
    expect(cleanSearchText(42)).toBe('');
    const long = 'a'.repeat(100);
    expect(cleanSearchText(long)).toHaveLength(MEMBER_SEARCH_MAX);
    const emojis = '😀'.repeat(80);
    expect(Array.from(cleanSearchText(emojis))).toHaveLength(MEMBER_SEARCH_MAX);
  });

  it('% _ \\ perdem o poder de curinga e * vira "qualquer caractere"', () => {
    expect(likePrefix('50%')).toBe('50\\%%');
    expect(likePrefix('a_b')).toBe('a\\_b%');
    expect(likePrefix('c:\\x')).toBe('c:\\\\x%');
    expect(likePrefix('Ma*')).toBe('Ma_%');
    expect(likePrefix('Maria')).toBe('Maria%');
  });

  it('texto com @ é e-mail: nunca é busca por nome', () => {
    expect(looksLikeEmail('fulana@exemplo.com')).toBe(true);
    expect(looksLikeEmail('Fulana')).toBe(false);
    expect(parseNameSearch('fulana@exemplo.com')).toBe('');
    expect(parseNameSearch(['fulana@exemplo.com'])).toBe('');
    expect(parseNameSearch(' Maria  ')).toBe('Maria');
    expect(parseNameSearch(undefined)).toBe('');
  });
});

describe('parâmetros da lista', () => {
  it('filtros só da lista; o resto vira "todos"', () => {
    expect(parseMemberFilter('equipe')).toBe('equipe');
    expect(parseMemberFilter('suspensos')).toBe('suspensos');
    expect(parseMemberFilter('novos')).toBe('novos');
    expect(parseMemberFilter('x')).toBe('todos');
    expect(parseMemberFilter(undefined)).toBe('todos');
    expect(parseMemberFilter(['equipe', 'novos'])).toBe('equipe');
  });

  it('página: inteiro positivo razoável, senão 1', () => {
    expect(parseMemberPage('3')).toBe(3);
    for (const bad of ['0', '-1', '1.5', 'abc', '', '123456', undefined, null]) {
      expect(parseMemberPage(bad)).toBe(1);
    }
  });

  it('25 por página e o intervalo de cada uma', () => {
    expect(MEMBERS_PAGE_SIZE).toBe(25);
    expect(memberPageRange(1)).toEqual({ from: 0, to: 24 });
    expect(memberPageRange(3)).toEqual({ from: 50, to: 74 });
    expect(memberPageCount(0)).toBe(1);
    expect(memberPageCount(25)).toBe(1);
    expect(memberPageCount(26)).toBe(2);
  });

  it('a busca por nome com @ não entra nos parâmetros', () => {
    expect(
      parseMemberListParams({ filtro: 'novos', pagina: '2', busca: 'fulana@exemplo.com' }),
    ).toEqual({ filter: 'novos', page: 2, search: '' });
  });

  it('o endereço da lista só leva o que foge do padrão', () => {
    expect(memberListHref({})).toBe('/painel/membros');
    expect(memberListHref({ filter: 'todos', page: 1, search: '' })).toBe('/painel/membros');
    expect(memberListHref({ filter: 'equipe', page: 2, search: 'Ana' })).toBe(
      '/painel/membros?filtro=equipe&busca=Ana&pagina=2',
    );
    expect(memberListHref({ search: 'João da Silva' })).toBe(
      '/painel/membros?busca=Jo%C3%A3o+da+Silva',
    );
  });

  it('avisos só de uma lista fixa (nenhum texto vem da URL)', () => {
    expect(parseMemberNotice('conta-excluida')).toBe('conta-excluida');
    expect(parseMemberNotice('<script>')).toBeNull();
    expect(parseMemberNotice(undefined)).toBeNull();
  });
});

describe('confirmação digitada', () => {
  it('o nome confere sem diferença de maiúsculas nem de espaços', () => {
    expect(isNameConfirmed('  maria   da silva ', 'Maria da Silva')).toBe(true);
    expect(isNameConfirmed('Maria', 'Maria da Silva')).toBe(false);
    expect(isNameConfirmed('', 'Maria')).toBe(false);
    expect(isNameConfirmed(undefined, 'Maria')).toBe(false);
    // Nome vazio no banco nunca é confirmado por texto vazio.
    expect(isNameConfirmed('', '')).toBe(false);
    expect(normalizeTypedName('Zoë')).toBe(normalizeTypedName('Zoe\u0308'));
  });
});

describe('origem do download por POST', () => {
  const base = {
    origin: 'https://clube.exemplo',
    host: 'clube.exemplo',
    forwardedHost: null,
    secFetchSite: 'same-origin',
  };

  it('mesmo site passa; x-forwarded-host vale mais que host (como na Vercel)', () => {
    expect(isSameOrigin(base)).toBe(true);
    expect(isSameOrigin({ ...base, host: 'interno:3000', forwardedHost: 'clube.exemplo' })).toBe(
      true,
    );
    expect(isSameOrigin({ ...base, secFetchSite: null })).toBe(true);
  });

  it('sem Origin, de outro site, de subdomínio irmão ou malformada: recusa', () => {
    expect(isSameOrigin({ ...base, origin: null })).toBe(false);
    expect(isSameOrigin({ ...base, origin: 'https://mal.exemplo' })).toBe(false);
    expect(isSameOrigin({ ...base, origin: 'https://sub.clube.exemplo' })).toBe(false);
    expect(isSameOrigin({ ...base, origin: 'nao-e-url' })).toBe(false);
    expect(isSameOrigin({ ...base, origin: 'null' })).toBe(false);
    expect(isSameOrigin({ ...base, origin: 'file:///x' })).toBe(false);
    expect(isSameOrigin({ ...base, secFetchSite: 'cross-site' })).toBe(false);
    expect(isSameOrigin({ ...base, secFetchSite: 'same-site' })).toBe(false);
    expect(isSameOrigin({ ...base, host: null, forwardedHost: null })).toBe(false);
  });

  it('a porta faz parte do host', () => {
    expect(
      isSameOrigin({ ...base, origin: 'https://localhost:3443', host: 'localhost:3443' }),
    ).toBe(true);
    expect(
      isSameOrigin({ ...base, origin: 'https://localhost:3443', host: 'localhost:3000' }),
    ).toBe(false);
  });
});

describe('auditoria da pessoa', () => {
  const rows = [
    {
      id: 'a1',
      actor_id: 'ator-1',
      action: 'role_change',
      details: { from: 'member', to: 'moderator' },
      created_at: '2026-10-05T12:00:00Z',
    },
    {
      id: 'a2',
      actor_id: 'ator-2',
      action: 'view_contact',
      details: {},
      created_at: '2026-10-05T11:00:00Z',
    },
    {
      id: 'a3',
      actor_id: 'ator-1',
      action: 'qualquer',
      details: { from: 'x' },
      created_at: '2026-10-05T10:00:00Z',
    },
    {
      id: 'a4',
      actor_id: 'ator-1',
      action: 'role_change',
      details: { from: 'member', to: 'rei' },
      created_at: '2026-10-05T09:00:00Z',
    },
  ];

  it('traz o nome de quem agiu; conta excluída fica sem nome', () => {
    const entries = toAuditEntries(rows, new Map([['ator-1', 'Ana']]));
    expect(entries.map((entry) => entry.actorName)).toEqual(['Ana', null, 'Ana', 'Ana']);
  });

  it('descreve em pt-BR só com cargos e o tipo da ação', () => {
    const entries = toAuditEntries(rows, new Map());
    expect(describeAuditEntry(entries[0]!)).toBe('Cargo alterado: Membro → Moderação');
    expect(describeAuditEntry(entries[1]!)).toBe('E-mail e último acesso consultados');
    // Ação desconhecida e `details` fora do formato nunca viram texto livre do banco.
    expect(describeAuditEntry(entries[2]!)).toBe('Ação registrada');
    expect(describeAuditEntry(entries[3]!)).toBe('Cargo alterado');
    for (const action of ['suspend', 'unsuspend', 'delete_account', 'export_data'] as const) {
      const [entry] = toAuditEntries([{ ...rows[1]!, action }], new Map());
      expect(describeAuditEntry(entry!)).not.toMatch(/@|ator-/);
    }
  });
});

describe('nome do arquivo e data de Brasília', () => {
  it('dados-<8 do uuid>-<data>, sem nome nem e-mail', () => {
    const name = memberExportFileName(ID, new Date('2026-10-05T15:00:00Z'));
    expect(name).toBe('dados-aaaaaaaa-2026-10-05.json');
    expect(name).not.toMatch(/@/);
  });

  it('virada de dia às 23h30: o arquivo leva o dia de Brasília, não o de UTC', () => {
    // 23h30 de 4/10 em Brasília (UTC-3) = 02h30 de 5/10 em UTC.
    expect(memberExportFileName(ID, new Date('2026-10-05T02:30:00Z'))).toBe(
      'dados-aaaaaaaa-2026-10-04.json',
    );
    // 00h30 de 5/10 em Brasília.
    expect(memberExportFileName(ID, new Date('2026-10-05T03:30:00Z'))).toBe(
      'dados-aaaaaaaa-2026-10-05.json',
    );
    // Virada de ano.
    expect(formatIsoDay(new Date('2026-01-01T02:59:59Z'))).toBe('2025-12-31');
    expect(formatIsoDay(new Date('2026-01-01T03:00:00Z'))).toBe('2026-01-01');
  });

  it('id que não é uuid não vira nome de arquivo', () => {
    expect(() => memberExportFileName('../etc', new Date())).toThrow();
    expect(() => memberExportFileName('Maria da Silva', new Date())).toThrow();
  });
});

describe('arquivo de dados da pessoa (versão 2)', () => {
  const payload = {
    account: {
      id: ID,
      email: 'ela@exemplo.com',
      created_at: '2026-01-01T00:00:00Z',
      last_sign_in_at: '2026-10-01T00:00:00Z',
      providers: ['email', 'google', 7],
    },
    progress: [
      {
        chapter: 4,
        updated_at: '2026-03-01T00:00:00Z',
        book_slug: 'o-livro',
        book_title: 'O Livro',
      },
    ],
  };

  it('lê a função do banco campo a campo e recusa conta de outra pessoa ou formato estranho', () => {
    const parsed = parseAdminExportPayload(payload, ID);
    expect(parsed?.account).toEqual({
      id: ID,
      email: 'ela@exemplo.com',
      createdAt: '2026-01-01T00:00:00Z',
      lastSignInAt: '2026-10-01T00:00:00Z',
      providers: ['email', 'google'],
    });
    expect(parsed?.progress).toEqual([
      {
        chapter: 4,
        updated_at: '2026-03-01T00:00:00Z',
        books: { slug: 'o-livro', title: 'O Livro' },
      },
    ]);
    expect(parseAdminExportPayload(payload, 'bbbbbbbb-1111-4222-8333-444444444444')).toBeNull();
    expect(parseAdminExportPayload(null, ID)).toBeNull();
    expect(parseAdminExportPayload({ account: {}, progress: [] }, ID)).toBeNull();
    expect(parseAdminExportPayload({ ...payload, progress: [{ chapter: 'x' }] }, ID)).toBeNull();
  });

  it('é o formato de "Baixar meus dados" v2, só com dados dela', () => {
    const parsed = parseAdminExportPayload(payload, ID)!;
    const file = buildMemberExport({
      generatedAt: new Date('2026-10-05T15:00:00Z'),
      payload: parsed,
      profile: {
        display_name: 'Ela',
        avatar_url: null,
        role: 'member',
        approved_comment_count: 1,
        display_name_confirmed_at: '2026-01-02T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
      comments: [
        {
          id: 'c1',
          session_id: 's1',
          parent_id: null,
          body: 'Meu comentário',
          status: 'approved',
          read_up_to: 3,
          spoiler_up_to: null,
          created_at: 'x',
          updated_at: 'y',
          reading_sessions: { number: 1, books: { slug: 'o-livro' } },
          // Dado de terceiros que chegasse por engano não entra:
          ...({ author: { email: OTHER_EMAIL } } as object),
        },
      ],
      commentsSuspended: true,
    });
    expect(file.exportVersion).toBe(2);
    expect(file.profile?.commentsSuspended).toBe(true);
    expect(file.account.email).toBe('ela@exemplo.com');
    expect(file.comments).toHaveLength(1);
    expect(JSON.stringify(file)).not.toContain(OTHER_EMAIL);
    expect(Object.keys(file).sort()).toEqual([
      'account',
      'comments',
      'exportVersion',
      'generatedAt',
      'profile',
      'readingProgress',
    ]);
  });
});
