import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Regras da gestão de membros (etapa 8f) que se garantem lendo o código:
 *  - o download da pessoa só existe por POST, com a checagem de origem;
 *  - toda Server Action confere `requireRole('admin')` PRIMEIRO e valida o id;
 *  - o e-mail nunca entra em URL, log, armazenamento do navegador nem cache;
 *  - o cargo é lido do banco a cada requisição (nunca do JWT nem de cache).
 */
const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const strip = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const memberFiles = [
  ...walk(join(ROOT, 'src/app/painel/membros')),
  ...walk(join(ROOT, 'src/components/membros')),
  ...walk(join(ROOT, 'src/lib/members')),
]
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
  .map((file) => ({ path: relative(ROOT, file), code: strip(readFileSync(file, 'utf8')) }));

const ACTIONS = 'src/app/painel/membros/actions.ts';
const ROUTE = 'src/app/painel/membros/[id]/dados/route.ts';

function bodies(source: string): { name: string; body: string }[] {
  return source
    .split(/^export async function /m)
    .slice(1)
    .map((part) => ({ name: part.slice(0, part.indexOf('(')), body: part }));
}

describe('download dos dados da pessoa', () => {
  const route = strip(read(ROUTE));

  it('a rota só exporta POST (nenhuma ação que grave é acionável por GET)', () => {
    const exported = [
      ...route.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g),
    ];
    expect(exported.map((match) => match[1])).toEqual(['POST']);
    expect(route).not.toMatch(/export\s*\{/);
    expect(route).not.toMatch(/export\s+default/);
  });

  it('confere a origem ANTES do papel, e o papel antes de ler qualquer coisa', () => {
    expect(route.indexOf('isSameOrigin(')).toBeGreaterThan(-1);
    expect(route.indexOf('isSameOrigin(')).toBeLessThan(route.indexOf("requireRole('admin')"));
    expect(route.indexOf("requireRole('admin')")).toBeLessThan(route.indexOf('createClient()'));
    expect(route.indexOf('isUuid(id)')).toBeLessThan(route.indexOf('createClient()'));
  });

  it('toda consulta é filtrada pelo id da pessoa e a auditoria (função do banco) é chamada por último', () => {
    expect(route).toMatch(/\.eq\('id', id\)/);
    expect(route).toMatch(/\.eq\('author_id', id\)/);
    expect(route).toMatch(/\.eq\('user_id', id\)/);
    expect(route.lastIndexOf("rpc('admin_member_export'")).toBeGreaterThan(
      route.lastIndexOf(".eq('user_id', id)"),
    );
    expect(route.lastIndexOf("rpc('admin_member_export'")).toBeGreaterThan(
      route.lastIndexOf(".eq('author_id', id)"),
    );
  });

  it('anexo, sem cache, nome do arquivo sem nome nem e-mail; falha volta ao perfil com aviso de lista fixa', () => {
    expect(route).toMatch(/'Cache-Control': 'no-store'/);
    expect(route).toMatch(/attachment; filename=/);
    expect(route).toMatch(/memberExportFileName\(id, now\)/);
    expect(route).not.toMatch(/display_name\s*\}|displayName.*filename|\.email.*filename/);
    expect(route).not.toMatch(/searchParams|request\.url|request\.json|formData\(/);
    expect(route).toMatch(/status: 303/);
  });

  it('sem a auditoria não há arquivo (contact_unavailable volta ao perfil, sem corpo de dados)', () => {
    expect(route).toMatch(/key === 'contact_unavailable'\) return backToProfile/);
  });
});

describe('Server Actions de membros', () => {
  const source = strip(read(ACTIONS));
  const actions = bodies(source);

  it('encontra as actions esperadas', () => {
    expect(actions.map((action) => action.name).sort()).toEqual(
      [
        'changeMemberRole',
        'deleteMember',
        'searchMembers',
        'setMemberSuspension',
        'showMemberContact',
      ].sort(),
    );
  });

  it.each(actions.map((action) => [action.name, action.body]))(
    "%s chama requireRole('admin') antes de qualquer outra coisa",
    (_name, body) => {
      const first = (body as string).indexOf('await requireRole(');
      expect(first).toBeGreaterThan(-1);
      expect(body as string).toMatch(/await requireRole\('admin'\)/);
      for (const marker of ['createClient(', 'rpc(', 'redirectTo(', 'isUuid(']) {
        const at = (body as string).indexOf(marker);
        if (at !== -1) expect(first, marker).toBeLessThan(at);
      }
    },
  );

  it.each(['changeMemberRole', 'deleteMember', 'setMemberSuspension', 'showMemberContact'])(
    '%s valida o id (uuid) antes de tocar no banco',
    (name) => {
      const body = actions.find((action) => action.name === name)!.body;
      expect(body.indexOf('isUuid(id)')).toBeGreaterThan(-1);
      expect(body.indexOf('isUuid(id)')).toBeLessThan(body.indexOf('createClient()'));
    },
  );

  it('o cliente só escolhe cargo de uma lista fixa e nunca manda o cargo "esperado" sem validação', () => {
    const body = actions.find((action) => action.name === 'changeMemberRole')!.body;
    expect(body).toMatch(/toRole\(role\)/);
    expect(body).toMatch(/toRole\(expectedRole\)/);
    expect(source).toMatch(/ROLE_VALUES: readonly string\[\] = \['admin', 'moderator', 'member'\]/);
  });

  it('o nome para dar Administração e o EXCLUIR são conferidos no servidor', () => {
    const role = actions.find((action) => action.name === 'changeMemberRole')!.body;
    expect(role).toMatch(/isNameConfirmed\(typedName, profile\.display_name\)/);
    const del = actions.find((action) => action.name === 'deleteMember')!.body;
    expect(del).toMatch(/isDeleteConfirmed\(confirmation\)/);
  });

  it('cargo e exclusão expiram o cache público; suspender só refaz o painel', () => {
    const role = actions.find((action) => action.name === 'changeMemberRole')!.body;
    expect(role).toMatch(/expireCommentsOf\(id\)/);
    expect(role).toMatch(/revalidatePath\('\/painel', 'layout'\)/);
    expect(source).toMatch(/async function expireCommentsOf[\s\S]*invalidateComments\(sessionId\)/);
    expect(source).toMatch(/async function expireCommentsOf[\s\S]*expireAllPublicComments\(\)/);
    const del = actions.find((action) => action.name === 'deleteMember')!.body;
    expect(del).toMatch(/expireAllPublicComments\(\)/);
    expect(del).toMatch(/revalidatePath\('\/painel', 'layout'\)/);
    const suspend = actions.find((action) => action.name === 'setMemberSuspension')!.body;
    expect(suspend).toMatch(/revalidatePath\('\/painel', 'layout'\)/);
    expect(suspend).not.toMatch(/invalidateComments|updateTag|revalidatePath\('\/',/);
  });

  it('o cliente nunca manda e-mail nem escolhe um alvo além do id', () => {
    for (const action of actions) {
      expect(action.body).not.toMatch(/formData\.get\('(userId|id|email|role)'\)/);
    }
  });
});

describe('o e-mail nunca vaza', () => {
  it('as funções que leem e-mail só são chamadas nos lugares previstos', () => {
    const callers = (name: string) =>
      walk(join(ROOT, 'src'))
        .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
        .filter((file) => new RegExp(`rpc\\('${name}'`).test(readFileSync(file, 'utf8')))
        .map((file) => relative(ROOT, file))
        .sort();
    expect(callers('admin_member_contact')).toEqual([ACTIONS]);
    expect(callers('admin_find_member_by_email')).toEqual([ACTIONS]);
    expect(callers('admin_member_export')).toEqual([ROUTE]);
    expect(callers('admin_masked_emails')).toEqual(['src/lib/members/queries.ts']);
  });

  it('nenhuma URL do painel de membros leva e-mail, e o redirecionamento da busca só leva um uuid', () => {
    for (const { path, code } of memberFiles) {
      expect(code, path).not.toMatch(/searchParams\.get\(\s*['"`]e-?mail/i);
      expect(code, path).not.toMatch(/[?&]email=/i);
      expect(code, path).not.toMatch(/encodeURIComponent\(\s*(typed|email|raw)/);
    }
    const search = bodies(strip(read(ACTIONS))).find((action) => action.name === 'searchMembers')!;
    expect(search.body).toMatch(/redirectTo\(adminMemberHref\(found\)\)/);
    expect(search.body).toMatch(/isUuid\(found\)/);
    expect(search.body).toMatch(
      /redirectTo\(memberListHref\(\{ filter, search: cleanSearchText\(typed\) \}\)\)/,
    );
  });

  it('nenhum armazenamento do navegador, nem cookie, nem console nos arquivos de membros', () => {
    for (const { path, code } of memberFiles) {
      expect(code, path).not.toMatch(
        /\b(localStorage|sessionStorage|indexedDB|document\.cookie|cookies\(\)|console\s*\.)/,
      );
    }
  });

  it('"Mostrar e-mail" não revalida nada nem guarda o resultado fora do estado da tela', () => {
    const body = bodies(strip(read(ACTIONS))).find(
      (action) => action.name === 'showMemberContact',
    )!.body;
    expect(body).not.toMatch(
      /revalidatePath|revalidateTag|updateTag|invalidate|unstable_cache|cookies|headers/,
    );
    const reveal = strip(read('src/components/membros/ContactReveal.tsx'));
    expect(reveal).toMatch(/useState<State>/);
    expect(reveal).toMatch(/addEventListener\('pagehide'/);
    expect(reveal).toMatch(/addEventListener\('pageshow'/);
    expect(reveal).not.toMatch(/useRef|createContext|useContext|window\.name|history\./);
  });

  it('a lista nunca usa o e-mail completo: só o mascarado vem do banco', () => {
    const list = strip(read('src/components/membros/MembersList.tsx'));
    expect(list).not.toMatch(/\.email\b/);
    const page = strip(read('src/app/painel/membros/page.tsx'));
    expect(page).not.toMatch(/admin_member_contact|auth\.getUser|\.email\b/);
    const queries = strip(read('src/lib/members/queries.ts'));
    expect(queries).not.toMatch(/select\([^)]*email/i);
  });
});

describe('o cargo vem do banco a cada requisição', () => {
  const session = strip(read('src/lib/auth/session.ts'));

  it('getCurrentUser lê profiles.role e só memoiza dentro da requisição', () => {
    expect(session).toMatch(/\.from\('profiles'\)/);
    expect(session).toMatch(
      /\.select\('display_name, avatar_url, role, display_name_confirmed_at'\)/,
    );
    expect(session).toMatch(/role:\s*parseRole\(profile\.role\)/);
    expect(session).toMatch(/import \{ cache \} from 'react'/);
    expect(session).not.toMatch(/unstable_cache|use cache|cacheLife|cacheTag/);
  });

  it('o papel nunca sai do JWT nem de metadata', () => {
    expect(session).not.toMatch(/claims\.(role|user_role|app_metadata)|app_metadata|user_metadata/);
  });

  it('nenhum módulo de autenticação nem de membros guarda o papel em cache de dados', () => {
    const files = [
      ...walk(join(ROOT, 'src/lib/auth')),
      ...walk(join(ROOT, 'src/lib/members')),
      ...walk(join(ROOT, 'src/app/painel/membros')),
    ].filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
    for (const file of files) {
      expect(strip(readFileSync(file, 'utf8')), relative(ROOT, file)).not.toMatch(
        /unstable_cache|'use cache'|cacheLife|cacheTag/,
      );
    }
  });
});

describe('a lista em dois desenhos', () => {
  const css = read('src/components/membros/members.module.css');

  it('o desenho escondido usa display:none (leitor de tela e teclado não o percorrem)', () => {
    expect(css).toMatch(/\.cardsView\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(
      /@media \(max-width: 760px\)\s*\{[\s\S]*\.tableView\s*\{[^}]*display:\s*none[\s\S]*\.cardsView\s*\{[^}]*display:\s*grid/,
    );
    // Nenhuma forma de esconder "só visualmente" (a lista completa seria lida duas vezes).
    const hiding = css.slice(css.indexOf('.tableView'), css.indexOf('.table {'));
    expect(hiding).not.toMatch(/visibility:\s*hidden|opacity:\s*0|clip:|sr-only|left:\s*-/);
  });

  it('cada pessoa tem um só link por desenho: o nome', () => {
    const list = strip(read('src/components/membros/MembersList.tsx'));
    expect(list.match(/<Link\b/g)).toHaveLength(2);
    expect(list).not.toMatch(/<(button|Button)\b/);
  });
});
